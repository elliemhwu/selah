import type {
  Anchor,
  Cadence,
  PercentBase,
  ResetAction,
  ResetCycle,
  Section,
  YearMonth,
} from '@selah/shared-types';
import { formatMoney, isWholeUnit, parseMoney } from '@selah/shared-utils';
import { isRealDate } from './dates';
import { ConflictError, FieldErrorCollector } from './errors';

// Versioned budget plans, saved whole (requirements §3, ADR 0012, 0018, 0019).

/** Reset cycles each rollover cadence supports: periods must not cross a reset (ADR 0018). */
const RESETS_FOR_CADENCE: Partial<Record<Cadence, readonly ResetCycle[]>> = {
  daily: ['never', 'week', 'month', 'year'],
  weekly: ['never', 'week'],
  monthly: ['never', 'month', 'year'],
};

export interface PlanOverride {
  month: YearMonth;
  amount: string;
}

export interface PlanItemInput {
  budgetItemId: string;
  section: Section;
  name: string;
  parentItemId?: string | null;
  cadence: Cadence;
  cadenceMonth?: number | null;
  cadenceDate?: string | null;
  anchor: Anchor;
  amount?: string | null;
  percent?: string | null;
  percentBase?: PercentBase;
  rollover?: boolean;
  resetCycle?: ResetCycle | null;
  onReset?: ResetAction | null;
  carryToItemId?: string | null;
  overrides?: PlanOverride[];
}

export interface PlanVersionInput {
  effectiveFromMonth: YearMonth;
  note?: string | null;
  items: PlanItemInput[];
}

/** A plan item checked and normalised, as stored and as the reports read it. */
export interface PlanItemData {
  budgetItemId: string;
  section: Section;
  name: string;
  parentItemId: string | null;
  cadence: Cadence;
  cadenceMonth: number | null;
  cadenceDate: string | null;
  anchor: Anchor;
  amount: string | null;
  percent: string | null;
  percentBase: PercentBase;
  rollover: boolean;
  resetCycle: ResetCycle | null;
  onReset: ResetAction | null;
  carryToItemId: string | null;
  overrides: PlanOverride[];
}

/** A version checked and normalised, ready to store. */
export interface PlanVersionValues {
  effectiveFromMonth: YearMonth;
  note: string | null;
  items: PlanItemData[];
}

export interface PlanVersionContext {
  /** The stored version with this id, deleted or not. */
  existing?: { deletedAt: unknown };
  /** The newest live version, if any. */
  newest?: { id: string };
  /** The newest live version other than this one: a new version must start after it. */
  previous?: { effectiveFromMonth: YearMonth };
  /** The section of every budget item that was ever saved; an item keeps its section. */
  knownSections: ReadonlyMap<string, Section>;
}

/** Checks a whole version to create or replace (ADR 0018) and normalises it. */
export function preparePlanVersion(id: string, input: PlanVersionInput, context: PlanVersionContext): PlanVersionValues {
  if (context.existing?.deletedAt) throw new ConflictError(`Plan version ${id} was deleted.`);
  if (context.existing && context.newest && context.newest.id !== id) {
    throw new ConflictError('Only the newest plan version can be changed; older versions are a read-only log.');
  }

  const errors = new FieldErrorCollector();
  const previous = context.previous;
  if (previous && input.effectiveFromMonth <= previous.effectiveFromMonth) {
    errors.add('effectiveFromMonth', `A new version must start after ${previous.effectiveFromMonth}.`);
  }
  const items = validateItems(input, context.knownSections, (field, message) => errors.add(field, message));
  errors.throwIfAny('The plan breaks the rules.');

  return {
    effectiveFromMonth: input.effectiveFromMonth,
    note: input.note && input.note.trim() ? input.note : null,
    items,
  };
}

/** Only the newest version can be deleted; older ones stay as the log (ADR 0018). */
export function assertPlanVersionDeletable(id: string, newest: { id: string } | undefined): void {
  if (newest && newest.id !== id) throw new ConflictError('Only the newest plan version can be deleted.');
}

/** Checks every item rule on the whole document (ADR 0018) and normalises the values. */
function validateItems(
  input: PlanVersionInput,
  existingSections: ReadonlyMap<string, Section>,
  add: (field: string, message: string) => void,
): PlanItemData[] {
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
      if (item.cadence === 'daily' || item.cadence === 'weekly') {
        fail('anchor', `A ${item.cadence} item is a fixed amount; percentages apply to a monthly base (ADR 0019).`);
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
      if (item.section === 'income') fail('rollover', "Income items are not budgets; they don't roll over (ADR 0019).");
      else if (!allowed) fail('rollover', 'Only daily, weekly and monthly items roll over.');
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
        else if (byId.get(carryToItemId)?.item.section === 'income') {
          fail('carryToItemId', "Leftovers can't be carried into an Income item (ADR 0019).");
        } else if (hasCarryLoop(item.budgetItemId, byId)) fail('carryToItemId', 'These carries form a loop.');
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
      overrides: overrides.map((o) => ({ month: o.month, amount: formatMoney(parseMoney(o.amount)) })),
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

/** True if following carry targets from `startId` comes back to it (ADR 0019). */
function hasCarryLoop(startId: string, byId: ReadonlyMap<string, { item: PlanItemInput }>): boolean {
  const seen = new Set<string>();
  let current = byId.get(startId)?.item;
  while (current?.rollover && current.onReset === 'carry' && current.carryToItemId) {
    if (current.carryToItemId === startId) return true;
    if (seen.has(current.carryToItemId)) return false;
    seen.add(current.carryToItemId);
    current = byId.get(current.carryToItemId)?.item;
  }
  return false;
}
