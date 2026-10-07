import { Injectable } from '@nestjs/common';
import { type IsoWeekday, type LocalDate, type ResetCycle, SECTIONS, type YearMonth } from '@selah/shared-types';
import {
  activeVersionFor,
  type Cents,
  computeLedger,
  DateError,
  endOfMonth,
  endOfWeek,
  endOfYear,
  formatMoney,
  type LedgerResult,
  type MonthPlan,
  parseMoney,
  parsePercent,
  type Period,
  periodContaining,
  type PlanItem,
  PlanError,
  planMonth,
  startOfMonth,
  yearMonthOf,
} from '@selah/shared-utils';
import { assertDateRange, isRealDate } from '../../common/dates';
import { NotFoundError, RuleViolationError } from '../../common/errors';
import { type BudgetTransferRow, BudgetTransfersRepository } from '../budget-transfers/budget-transfers.repository';
import { type ItemData, PlanRepository } from '../plan/plan.repository';
import type {
  BudgetMovementDto,
  BudgetTransfersReportQuery,
  ChecklistItemDto,
  EnvelopeDto,
  ItemReviewDto,
  MonthlyReviewDto,
  SectionReviewDto,
} from './reports.dto';
import { ReportsRepository } from './reports.repository';

/** A plan version as the shared-utils math needs it, with the stored fields alongside. */
interface LoadedVersion {
  id: string;
  effectiveFromMonth: YearMonth;
  items: PlanItem[];
  data: ItemData[];
}

/** The reports of ADR 0019, calculated on read (ADR 0011). */
@Injectable()
export class ReportsService {
  constructor(
    private readonly reports: ReportsRepository,
    private readonly plan: PlanRepository,
    private readonly transfers: BudgetTransfersRepository,
  ) {}

  /** What is left in every rollover item of the active version (home screen). */
  async envelopes(date: LocalDate): Promise<EnvelopeDto[]> {
    assertRealDate(date);
    const { versions, weekStartDay } = await this.loadPlan();
    const version = activeOrThrow(versions, yearMonthOf(date));
    const ledger = await this.ledger(versions, date, weekStartDay);

    return version.data.flatMap((item) => {
      const envelope = ledger.envelopes.find((e) => e.budgetItemId === item.budgetItemId && e.end === date);
      const period = envelope?.periods.at(-1);
      if (!envelope || !period) return [];
      const current = periodContaining(envelope.cadence, date, weekStartDay);
      return [
        {
          ...itemFields(item),
          resetCycle: envelope.resetCycle,
          onReset: item.onReset,
          carryToItemId: item.carryToItemId,
          envelopeStart: envelope.start,
          resetsOn: cycleEnd(envelope.resetCycle, date, weekStartDay),
          period: { start: period.start, end: current.end },
          allotment: formatMoney(period.allotment),
          carryIn: formatMoney(period.carryIn),
          transfers: formatMoney(period.transfers),
          spent: formatMoney(period.spent),
          available: formatMoney(period.leftover),
        },
      ];
    });
  }

  /** This period's recurring items that aren't envelopes: recorded or not yet (home screen). */
  async checklist(date: LocalDate): Promise<ChecklistItemDto[]> {
    assertRealDate(date);
    const { versions, weekStartDay } = await this.loadPlan();
    const month = yearMonthOf(date);
    const version = activeOrThrow(versions, month);
    const plan = guard(() => planMonth(version.items, month));

    const entries = version.data.flatMap((item) => {
      const period = checklistPeriod(item, date, weekStartDay);
      if (item.rollover || !period) return [];
      const amounts = item.cadence === 'daily' || item.cadence === 'weekly' ? plan.periodAmounts : plan.monthlyAmounts;
      return [{ item, period, planned: amounts.get(item.budgetItemId) ?? 0n }];
    });
    if (entries.length === 0) return [];

    const from = entries.reduce((min, e) => (e.period.start < min ? e.period.start : min), entries[0].period.start);
    const to = entries.reduce((max, e) => (e.period.end > max ? e.period.end : max), entries[0].period.end);
    const lines = await this.reports.lines(from, to);
    const subtrees = subtreesOf(version.data);

    return entries.map(({ item, period, planned }) => {
      const subtree = subtrees.get(item.budgetItemId) as Set<string>;
      const matching = lines.filter(
        (l) => l.budgetItemId && subtree.has(l.budgetItemId) && l.occurredOn >= period.start && l.occurredOn <= period.end,
      );
      const recorded = matching.reduce((sum, l) => sum + parseMoney(l.twdAmount), 0n);
      return {
        ...itemFields(item),
        period,
        planned: formatMoney(planned),
        recorded: formatMoney(recorded),
        lineCount: matching.length,
        done: matching.length > 0,
      };
    });
  }

  /** Plan vs. actual for a month (monthly review). */
  async monthly(month: YearMonth): Promise<MonthlyReviewDto> {
    const { versions, weekStartDay } = await this.loadPlan();
    const version = activeOrThrow(versions, month);
    const monthStart = `${month}-01`;
    const monthEnd = endOfMonth(monthStart);
    const plan = guard(() => planMonth(version.items, month));
    const [ledger, lines, manual] = await Promise.all([
      this.ledger(versions, monthEnd, weekStartDay),
      this.reports.lines(`${month.slice(0, 4)}-01-01`, monthEnd),
      this.transfers.list({ from: monthStart, to: monthEnd, kind: 'manual' }),
    ]);

    const inVersion = new Set(version.data.map((i) => i.budgetItemId));
    const actualOwn = new Map<string, Cents>();
    const yearOwn = new Map<string, Cents>();
    const unplanned = { income: 0n, expense: 0n };
    for (const line of lines) {
      const amount = parseMoney(line.twdAmount);
      const itemId = line.budgetItemId && inVersion.has(line.budgetItemId) ? line.budgetItemId : null;
      if (itemId) add(yearOwn, itemId, amount);
      if (line.occurredOn < monthStart) continue;
      if (itemId) add(actualOwn, itemId, amount);
      else unplanned[line.type] += amount;
    }

    const transferOwn = new Map<string, Cents>();
    for (const t of manual) {
      const amount = parseMoney(t.amount);
      add(transferOwn, t.fromItemId, -amount);
      if (t.toItemId) add(transferOwn, t.toItemId, amount);
    }
    for (const r of ledger.resets) {
      if (r.date < monthStart || r.date > monthEnd) continue;
      add(transferOwn, r.fromItemId, -r.amount);
      if (r.toItemId) add(transferOwn, r.toItemId, r.amount);
    }

    const subtrees = subtreesOf(version.data);
    const rolledUp = (own: ReadonlyMap<string, Cents>, id: string): Cents => {
      let total = 0n;
      for (const member of subtrees.get(id) ?? []) total += own.get(member) ?? 0n;
      return total;
    };
    const yearPlans = yearPlansFor(versions, month.slice(0, 4));

    const figures = version.data.map((item) => {
      const id = item.budgetItemId;
      return {
        item,
        planned: plan.monthlyAmounts.get(id) ?? 0n,
        transfers: rolledUp(transferOwn, id),
        actual: rolledUp(actualOwn, id),
      };
    });

    const items: ItemReviewDto[] = figures.map(({ item, planned, transfers, actual }) => ({
      ...itemFields(item),
      ...planActual(planned, transfers, actual),
      year:
        item.cadence === 'yearly' || item.cadence === 'one_time'
          ? {
              planned: formatMoney(yearPlans.reduce((sum, p) => sum + (p?.monthlyAmounts.get(item.budgetItemId) ?? 0n), 0n)),
              actual: formatMoney(rolledUp(yearOwn, item.budgetItemId)),
            }
          : null,
    }));

    const sections: SectionReviewDto[] = SECTIONS.map((section) => {
      const top = figures.filter((f) => f.item.section === section && f.item.parentItemId === null);
      const sum = (pick: (f: (typeof figures)[number]) => Cents) => top.reduce((total, f) => total + pick(f), 0n);
      return {
        section,
        ...planActual(
          sum((f) => f.planned),
          sum((f) => f.transfers),
          sum((f) => f.actual),
        ),
      };
    });

    return {
      month,
      planVersionId: version.id,
      bases: {
        grossIncome: formatMoney(plan.bases.grossIncome),
        government: formatMoney(plan.bases.government),
        netIncome: formatMoney(plan.bases.netIncome),
      },
      sections,
      items,
      unplanned: { income: formatMoney(unplanned.income), expense: formatMoney(unplanned.expense) },
    };
  }

  /** Manual transfers and computed resets together, in date order (requirements §3.1). */
  async budgetTransfers(query: BudgetTransfersReportQuery): Promise<BudgetMovementDto[]> {
    assertDateRange(query.from, query.to);
    const { versions, weekStartDay } = await this.loadPlan();
    const [ledger, manual] = await Promise.all([
      this.ledger(versions, query.to, weekStartDay),
      this.transfers.list({ from: query.from, to: query.to, budgetItemId: query.budgetItemId, kind: 'manual' }),
    ]);
    const touches = (fromId: string, toId: string | null) =>
      !query.budgetItemId || fromId === query.budgetItemId || toId === query.budgetItemId;

    const resets: BudgetMovementDto[] = ledger.resets
      .filter((r) => r.date >= query.from && r.date <= query.to && touches(r.fromItemId, r.toItemId))
      .map((r) => ({
        kind: 'reset',
        id: null,
        occurredOn: r.date,
        occurredAt: null,
        fromItemId: r.fromItemId,
        toItemId: r.toItemId,
        amount: formatMoney(r.amount),
        note: null,
      }));
    // A reset happens at the end of its day, after that day's manual transfers.
    return [...manual.map(toMovement), ...resets].sort((a, b) =>
      a.occurredOn < b.occurredOn ? -1 : a.occurredOn > b.occurredOn ? 1 : 0,
    );
  }

  private async loadPlan(): Promise<{ versions: LoadedVersion[]; weekStartDay: IsoWeekday }> {
    const [documents, weekStartDay] = await Promise.all([this.plan.loadAllDocuments(), this.reports.weekStartDay()]);
    const versions = documents.map(({ version, items }) => ({
      id: version.id,
      effectiveFromMonth: version.effectiveFromMonth.slice(0, 7),
      items: items.map(toPlanItem),
      data: items,
    }));
    return { versions, weekStartDay };
  }

  /** Envelopes and resets of every rollover item up to `until`. */
  private async ledger(versions: LoadedVersion[], until: LocalDate, weekStartDay: IsoWeekday): Promise<LedgerResult> {
    const first = versions[0]?.effectiveFromMonth;
    if (!first || `${first}-01` > until) return { envelopes: [], resets: [] };
    const [lines, manual] = await Promise.all([
      this.reports.lines(`${first}-01`, until),
      this.transfers.list({ from: `${first}-01`, to: until, kind: 'manual' }),
    ]);
    return guard(() =>
      computeLedger({
        versions,
        spending: lines.flatMap((l) =>
          l.type === 'expense' && l.budgetItemId
            ? [{ budgetItemId: l.budgetItemId, date: l.occurredOn, amount: parseMoney(l.twdAmount) }]
            : [],
        ),
        transfers: manual.flatMap((t) =>
          t.toItemId
            ? [{ fromItemId: t.fromItemId, toItemId: t.toItemId, date: t.occurredOn, amount: parseMoney(t.amount) }]
            : [],
        ),
        until,
        weekStartDay,
      }),
    );
  }
}

function activeOrThrow(versions: readonly LoadedVersion[], month: YearMonth): LoadedVersion {
  const version = activeVersionFor(versions, month);
  if (!version) throw new NotFoundError(`No plan version covers ${month}.`);
  return version;
}

/** Plans saved before the ADR 0019 rules can break the math; report that as a rule violation. */
function guard<T>(calculate: () => T): T {
  try {
    return calculate();
  } catch (error) {
    if (error instanceof PlanError || error instanceof DateError) {
      throw new RuleViolationError(`The plan can't be reported on: ${error.message}. Save it again to see what to fix.`);
    }
    throw error;
  }
}

function assertRealDate(date: string): void {
  if (!isRealDate(date)) throw new RuleViolationError('The date is invalid.', { date: ['date is not a real date'] });
}

function itemFields(item: ItemData) {
  return {
    budgetItemId: item.budgetItemId,
    name: item.name,
    section: item.section,
    parentItemId: item.parentItemId,
    cadence: item.cadence,
  };
}

function planActual(planned: Cents, transfers: Cents, actual: Cents) {
  return {
    planned: formatMoney(planned),
    transfers: formatMoney(transfers),
    actual: formatMoney(actual),
    remaining: formatMoney(planned + transfers - actual),
  };
}

/** The checklist period containing `date`, or null if the item isn't due in it. */
function checklistPeriod(item: ItemData, date: LocalDate, weekStartDay: IsoWeekday): Period | null {
  const month: Period = { start: startOfMonth(date), end: endOfMonth(date) };
  switch (item.cadence) {
    case 'daily':
    case 'weekly':
    case 'monthly':
      return periodContaining(item.cadence, date, weekStartDay);
    case 'yearly':
      return item.cadenceMonth === Number(date.slice(5, 7)) ? month : null;
    case 'one_time':
      return item.cadenceDate && yearMonthOf(item.cadenceDate) === yearMonthOf(date) ? month : null;
  }
}

function cycleEnd(cycle: ResetCycle, date: LocalDate, weekStartDay: IsoWeekday): LocalDate | null {
  switch (cycle) {
    case 'never':
      return null;
    case 'week':
      return endOfWeek(date, weekStartDay);
    case 'month':
      return endOfMonth(date);
    case 'year':
      return endOfYear(date);
  }
}

/** Each item with all its descendants (itself included), by the version's tree. */
function subtreesOf(items: readonly ItemData[]): Map<string, Set<string>> {
  const subtrees = new Map(items.map((i) => [i.budgetItemId, new Set([i.budgetItemId])]));
  for (const item of items) {
    const seen = new Set<string>();
    for (let parent = item.parentItemId; parent && !seen.has(parent); ) {
      seen.add(parent);
      subtrees.get(parent)?.add(item.budgetItemId);
      parent = items.find((i) => i.budgetItemId === parent)?.parentItemId ?? null;
    }
  }
  return subtrees;
}

/** planMonth() for each month of a year, using the version active in that month. */
function yearPlansFor(versions: readonly LoadedVersion[], year: string): (MonthPlan | undefined)[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    const version = activeVersionFor(versions, month);
    return version && guard(() => planMonth(version.items, month));
  });
}

function add(map: Map<string, Cents>, key: string, amount: Cents): void {
  map.set(key, (map.get(key) ?? 0n) + amount);
}

function toPlanItem(item: ItemData): PlanItem {
  return {
    ...item,
    amount: item.amount === null ? null : parseMoney(item.amount),
    percent: item.percent === null ? null : parsePercent(item.percent),
    overrides: item.overrides.map((o) => ({ month: o.month.slice(0, 7), amount: parseMoney(o.amount) })),
  };
}

function toMovement(row: BudgetTransferRow): BudgetMovementDto {
  return {
    kind: 'manual',
    id: row.id,
    occurredOn: row.occurredOn,
    occurredAt: row.occurredAt ? row.occurredAt.slice(0, 5) : null,
    fromItemId: row.fromItemId,
    toItemId: row.toItemId,
    amount: row.amount,
    note: row.note,
  };
}
