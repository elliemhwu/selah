import { Injectable } from '@nestjs/common';
import type { Cadence, ResetCycle, Section } from '@selah/shared-types';
import { formatMoney, isWholeUnit, parseMoney, toDayNumber } from '@selah/shared-utils';
import { ConflictError, type FieldErrors, NotFoundError, RuleViolationError } from '../../common/errors';
import type {
  PlanItemDto,
  PlanItemInput,
  PlanVersionDto,
  PlanVersionSummaryDto,
  UpsertPlanVersionDto,
} from './plan.dto';
import { type ItemData, PlanRepository, type VersionDocument } from './plan.repository';

/** Reset cycles each rollover cadence supports: periods must not cross a reset (ADR 0018). */
const RESETS_FOR_CADENCE: Partial<Record<Cadence, readonly ResetCycle[]>> = {
  daily: ['never', 'week', 'month', 'year'],
  weekly: ['never', 'week'],
  monthly: ['never', 'month', 'year'],
};

@Injectable()
export class PlanService {
  constructor(private readonly plan: PlanRepository) {}

  async listVersions(): Promise<PlanVersionSummaryDto[]> {
    const rows = await this.plan.listVersions();
    const newestId = rows.at(-1)?.id;
    return rows.map((v) => ({
      id: v.id,
      effectiveFromMonth: toYearMonth(v.effectiveFromMonth),
      note: v.note,
      editable: v.id === newestId,
      itemCount: v.itemCount,
    }));
  }

  async getVersion(id: string): Promise<PlanVersionDto> {
    const version = await this.plan.findVersion(id);
    if (!version || version.deletedAt) throw new NotFoundError(`Plan version ${id} not found.`);
    return this.toDto(await this.plan.loadDocument(version));
  }

  /** The version in effect for a month (YYYY-MM). */
  async activeFor(month: string): Promise<PlanVersionDto> {
    const version = await this.plan.activeVersion(`${month}-01`);
    if (!version) throw new NotFoundError(`No plan version covers ${month}.`);
    return this.toDto(await this.plan.loadDocument(version));
  }

  /** Creates or replaces a whole version (ADR 0018). */
  async upsert(id: string, input: UpsertPlanVersionDto): Promise<{ version: PlanVersionDto; created: boolean }> {
    const existing = await this.plan.findVersion(id);
    if (existing?.deletedAt) throw new ConflictError(`Plan version ${id} was deleted.`);
    const newest = await this.plan.newestVersion();
    if (existing && newest && newest.id !== id) {
      throw new ConflictError('Only the newest plan version can be changed; older versions are a read-only log.');
    }

    const errors: FieldErrors = {};
    const add = (field: string, message: string) => (errors[field] ??= []).push(message);

    const previous = await this.plan.newestVersion(id);
    if (previous && `${input.effectiveFromMonth}-01` <= previous.effectiveFromMonth) {
      add('effectiveFromMonth', `A new version must start after ${toYearMonth(previous.effectiveFromMonth)}.`);
    }

    const sections = await this.plan.itemSections(input.items.map((i) => i.budgetItemId));
    const items = validateItems(input, sections, add);
    if (Object.keys(errors).length) throw new RuleViolationError('The plan breaks the rules.', errors);

    const created = await this.plan.save({
      id,
      effectiveFromMonth: `${input.effectiveFromMonth}-01`,
      note: input.note && input.note.trim() ? input.note : null,
      items,
    });
    return { version: await this.getVersion(id), created };
  }

  /** Deletes the newest version; older ones stay as the log (ADR 0018). */
  async remove(id: string): Promise<void> {
    const version = await this.plan.findVersion(id);
    if (!version) throw new NotFoundError(`Plan version ${id} not found.`);
    if (version.deletedAt) return;
    const newest = await this.plan.newestVersion();
    if (newest && newest.id !== id) {
      throw new ConflictError('Only the newest plan version can be deleted.');
    }
    await this.plan.softDeleteVersion(id);
  }

  private async toDto({ version, items }: VersionDocument): Promise<PlanVersionDto> {
    const newest = await this.plan.newestVersion();
    return {
      id: version.id,
      effectiveFromMonth: toYearMonth(version.effectiveFromMonth),
      note: version.note,
      editable: newest?.id === version.id,
      items: items.map(toItemDto),
      createdAt: version.createdAt.toISOString(),
      updatedAt: version.updatedAt.toISOString(),
    };
  }
}

/** Checks every item rule on the whole document (ADR 0018) and normalises the values. */
function validateItems(
  input: UpsertPlanVersionDto,
  existingSections: ReadonlyMap<string, Section>,
  add: (field: string, message: string) => void,
): ItemData[] {
  const byId = new Map<string, { index: number; item: PlanItemInput }>();
  input.items.forEach((item, index) => {
    if (byId.has(item.budgetItemId)) add(`items.${index}.budgetItemId`, 'This item appears twice in the version.');
    else byId.set(item.budgetItemId, { index, item });
  });

  return input.items.map((item, index) => {
    const field = (name: string) => `items.${index}.${name}`;
    const fail = (name: string, message: string) => add(field(name), message);

    const knownSection = existingSections.get(item.budgetItemId);
    if (knownSection && knownSection !== item.section) {
      fail('section', `This item belongs to ${knownSection}; an item can't change section. Create a new item instead.`);
    }

    // Tree: the parent is another item of this version, in the same section, with no loop.
    const parentId = item.parentItemId ?? null;
    if (parentId) {
      const parent = byId.get(parentId);
      if (parentId === item.budgetItemId) fail('parentItemId', "An item can't be its own parent.");
      else if (!parent) fail('parentItemId', 'The parent must be an item in this version.');
      else if (parent.item.section !== item.section) fail('parentItemId', 'The parent must be in the same section.');
      else if (hasLoop(item.budgetItemId, byId)) fail('parentItemId', 'These parents form a loop.');
    }

    // Cadence fields.
    const cadenceMonth = item.cadenceMonth ?? null;
    const cadenceDate = item.cadenceDate ?? null;
    if (item.cadence === 'yearly' && cadenceMonth === null) fail('cadenceMonth', 'A yearly item needs a month.');
    if (item.cadence !== 'yearly' && cadenceMonth !== null) fail('cadenceMonth', 'Only yearly items have a month.');
    if (item.cadence === 'one_time' && cadenceDate === null) fail('cadenceDate', 'A one-time item needs a date.');
    if (item.cadence !== 'one_time' && cadenceDate !== null) fail('cadenceDate', 'Only one-time items have a date.');
    if (cadenceDate !== null && !isRealDate(cadenceDate)) fail('cadenceDate', 'cadenceDate is not a real date');

    // Anchor: amount or percent, never both.
    const percentBase = item.percentBase ?? 'net_income';
    let amount: string | null = null;
    let percent: string | null = null;
    if (item.anchor === 'amount') {
      if (item.amount == null) fail('amount', 'An amount-anchored item needs an amount.');
      else {
        const cents = parseMoney(item.amount);
        if (cents < 0n) fail('amount', 'Plan amounts must not be negative.');
        else if (!isWholeUnit(cents)) fail('amount', 'Plan amounts are whole TWD.');
        amount = formatMoney(cents);
      }
      if (item.percent != null) fail('percent', 'An amount-anchored item has no percent; it is calculated.');
    } else {
      if (item.percent == null) fail('percent', 'A percent-anchored item needs a percent.');
      else percent = item.percent;
      if (item.amount != null) fail('amount', 'A percent-anchored item has no amount; it is calculated.');
      if (item.section === 'income') fail('anchor', 'Income items are fixed amounts; a percent of income would be circular.');
      if (item.section === 'government' && percentBase !== 'gross_income') {
        fail('percentBase', 'Government items use gross_income; net income is defined after Government.');
      }
    }

    // Rollover.
    const rollover = item.rollover ?? false;
    const resetCycle = item.resetCycle ?? null;
    const onReset = item.onReset ?? null;
    const carryToItemId = item.carryToItemId ?? null;
    if (!rollover) {
      if (resetCycle !== null) fail('resetCycle', 'Only rollover items reset.');
      if (onReset !== null) fail('onReset', 'Only rollover items reset.');
      if (carryToItemId !== null) fail('carryToItemId', 'Only rollover items carry.');
    } else {
      const allowed = RESETS_FOR_CADENCE[item.cadence];
      if (!allowed) fail('rollover', 'Only daily, weekly and monthly items roll over.');
      if (resetCycle === null) fail('resetCycle', 'A rollover item needs a reset cycle (or never).');
      else if (allowed && !allowed.includes(resetCycle)) {
        fail('resetCycle', `A ${item.cadence} item can reset: ${allowed.join(', ')}.`);
      }
      if (resetCycle === 'never') {
        if (onReset !== null) fail('onReset', 'An item that never resets has no reset action.');
      } else if (resetCycle !== null && onReset === null) {
        fail('onReset', 'Choose what happens at reset: drop or carry.');
      }
      if (onReset === 'carry') {
        if (carryToItemId === null) fail('carryToItemId', 'Choose the item to carry into.');
        else if (carryToItemId === item.budgetItemId) fail('carryToItemId', "An item can't carry into itself.");
        else if (!byId.has(carryToItemId)) fail('carryToItemId', 'The carry target must be an item in this version.');
      } else if (carryToItemId !== null) {
        fail('carryToItemId', 'Only `carry` has a target item.');
      }
    }

    // Overrides.
    const overrides = item.overrides ?? [];
    if (overrides.length && item.cadence !== 'monthly') fail('overrides', 'Only monthly items have overrides.');
    const months = new Set<string>();
    overrides.forEach((o, j) => {
      const oField = `overrides.${j}`;
      if (months.has(o.month)) fail(`${oField}.month`, 'This month is overridden twice.');
      months.add(o.month);
      if (o.month < input.effectiveFromMonth) fail(`${oField}.month`, 'Overrides start from the version start month.');
      const cents = parseMoney(o.amount);
      if (cents < 0n || !isWholeUnit(cents)) fail(`${oField}.amount`, 'Overrides are whole, non-negative TWD.');
    });

    return {
      budgetItemId: item.budgetItemId,
      section: item.section,
      name: item.name.trim(),
      parentItemId: parentId,
      cadence: item.cadence,
      cadenceMonth,
      cadenceDate,
      anchor: item.anchor,
      amount,
      percent,
      percentBase,
      rollover,
      resetCycle: rollover ? resetCycle : null,
      onReset: rollover ? onReset : null,
      carryToItemId: rollover ? carryToItemId : null,
      overrides: overrides.map((o) => ({ month: `${o.month}-01`, amount: formatMoney(parseMoney(o.amount)) })),
    };
  });
}

/** True if following parents from `startId` ever repeats an item. */
function hasLoop(startId: string, byId: ReadonlyMap<string, { item: PlanItemInput }>): boolean {
  const seen = new Set<string>();
  let current: string | null | undefined = startId;
  while (current) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = byId.get(current)?.item.parentItemId;
  }
  return false;
}

function isRealDate(date: string): boolean {
  try {
    toDayNumber(date);
    return true;
  } catch {
    return false;
  }
}

function toYearMonth(firstOfMonth: string): string {
  return firstOfMonth.slice(0, 7);
}

function toItemDto(item: ItemData): PlanItemDto {
  return { ...item, overrides: item.overrides.map((o) => ({ month: toYearMonth(o.month), amount: o.amount })) };
}
