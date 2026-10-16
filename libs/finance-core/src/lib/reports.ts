import {
  type BudgetTransferKind,
  type Cadence,
  type IsoWeekday,
  type LocalDate,
  type ResetAction,
  type ResetCycle,
  type Section,
  SECTIONS,
  type YearMonth,
} from '@selah/shared-types';
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
import { assertDateRange, assertRealDate } from './dates';
import { NotFoundError, RuleViolationError } from './errors';
import type { PlanItemData } from './plan-versions';

// The reports of ADR 0019, calculated on read (ADR 0011). Each takes what it
// reads as plain values; rows outside the dates it needs are ignored, so a
// caller may pass more than that.

/** A live plan version with its items. */
export interface ReportVersion {
  id: string;
  effectiveFromMonth: YearMonth;
  items: readonly PlanItemData[];
}

/** A live income or expense line, with its record's date and type. */
export interface ReportLine {
  budgetItemId: string | null;
  occurredOn: LocalDate;
  type: 'income' | 'expense';
  twdAmount: string;
}

/** A live manual budget transfer. */
export interface ReportTransfer {
  id: string;
  occurredOn: LocalDate;
  occurredAt: string | null;
  fromItemId: string;
  toItemId: string | null;
  amount: string;
  note: string | null;
  createdAt: string;
}

export interface ReportData {
  versions: readonly ReportVersion[];
  lines: readonly ReportLine[];
  /** Manual transfers only; resets are computed. */
  transfers: readonly ReportTransfer[];
  weekStartDay: IsoWeekday;
}

export interface ReportItem {
  budgetItemId: string;
  name: string;
  section: Section;
  parentItemId: string | null;
  cadence: Cadence;
}

export interface EnvelopeReport extends ReportItem {
  resetCycle: ResetCycle;
  onReset: ResetAction | null;
  carryToItemId: string | null;
  envelopeStart: LocalDate;
  resetsOn: LocalDate | null;
  period: Period;
  allotment: string;
  carryIn: string;
  transfers: string;
  spent: string;
  available: string;
}

export interface ChecklistReport extends ReportItem {
  period: Period;
  planned: string;
  recorded: string;
  lineCount: number;
  done: boolean;
}

export interface PlanActual {
  planned: string;
  transfers: string;
  actual: string;
  remaining: string;
}

export interface ItemReview extends ReportItem, PlanActual {
  year: { planned: string; actual: string } | null;
}

export interface MonthlyReview {
  month: YearMonth;
  planVersionId: string;
  bases: { grossIncome: string; government: string; netIncome: string };
  sections: (PlanActual & { section: Section })[];
  items: ItemReview[];
  unplanned: { income: string; expense: string };
}

export interface BudgetMovement {
  kind: BudgetTransferKind;
  /** Null for a computed reset. */
  id: string | null;
  occurredOn: LocalDate;
  occurredAt: string | null;
  fromItemId: string;
  /** Null when a reset drops the leftover. */
  toItemId: string | null;
  /** Negative for a reset that carries an overspend. */
  amount: string;
  note: string | null;
}

/** A plan version as the shared-utils math needs it, with the stored items alongside. */
interface LoadedVersion {
  id: string;
  effectiveFromMonth: YearMonth;
  items: PlanItem[];
  data: readonly PlanItemData[];
}

/** What is left in every rollover item of the version active on `date` (home screen). */
export function envelopesReport(data: ReportData, date: LocalDate): EnvelopeReport[] {
  assertRealDate(date);
  const versions = loadVersions(data.versions);
  const version = activeOrThrow(versions, yearMonthOf(date));
  const ledger = ledgerUntil(data, versions, date);

  return version.data.flatMap((item) => {
    const envelope = ledger.envelopes.find((e) => e.budgetItemId === item.budgetItemId && e.end === date);
    const period = envelope?.periods.at(-1);
    if (!envelope || !period) return [];
    const current = periodContaining(envelope.cadence, date, data.weekStartDay);
    return [
      {
        ...itemFields(item),
        resetCycle: envelope.resetCycle,
        onReset: item.onReset,
        carryToItemId: item.carryToItemId,
        envelopeStart: envelope.start,
        resetsOn: cycleEnd(envelope.resetCycle, date, data.weekStartDay),
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
export function checklistReport(data: ReportData, date: LocalDate): ChecklistReport[] {
  assertRealDate(date);
  const versions = loadVersions(data.versions);
  const month = yearMonthOf(date);
  const version = activeOrThrow(versions, month);
  const plan = guard(() => planMonth(version.items, month));

  const entries = version.data.flatMap((item) => {
    const period = checklistPeriod(item, date, data.weekStartDay);
    if (item.rollover || !period) return [];
    const amounts = item.cadence === 'daily' || item.cadence === 'weekly' ? plan.periodAmounts : plan.monthlyAmounts;
    return [{ item, period, planned: amounts.get(item.budgetItemId) ?? 0n }];
  });
  const subtrees = subtreesOf(version.data);

  return entries.map(({ item, period, planned }) => {
    const subtree = subtrees.get(item.budgetItemId) as Set<string>;
    const matching = data.lines.filter(
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
export function monthlyReview(data: ReportData, month: YearMonth): MonthlyReview {
  const versions = loadVersions(data.versions);
  const version = activeOrThrow(versions, month);
  const monthStart = `${month}-01`;
  const monthEnd = endOfMonth(monthStart);
  const yearStart = `${month.slice(0, 4)}-01-01`;
  const plan = guard(() => planMonth(version.items, month));
  const ledger = ledgerUntil(data, versions, monthEnd);

  const inVersion = new Set(version.data.map((i) => i.budgetItemId));
  const actualOwn = new Map<string, Cents>();
  const yearOwn = new Map<string, Cents>();
  const unplanned = { income: 0n, expense: 0n };
  for (const line of data.lines) {
    if (line.occurredOn < yearStart || line.occurredOn > monthEnd) continue;
    const amount = parseMoney(line.twdAmount);
    const itemId = line.budgetItemId && inVersion.has(line.budgetItemId) ? line.budgetItemId : null;
    if (itemId) add(yearOwn, itemId, amount);
    if (line.occurredOn < monthStart) continue;
    if (itemId) add(actualOwn, itemId, amount);
    else unplanned[line.type] += amount;
  }

  const transferOwn = new Map<string, Cents>();
  for (const t of data.transfers) {
    if (t.occurredOn < monthStart || t.occurredOn > monthEnd) continue;
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

  const items: ItemReview[] = figures.map(({ item, planned, transfers, actual }) => ({
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

  const sections = SECTIONS.map((section) => {
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

export interface MovementQuery {
  from: LocalDate;
  to: LocalDate;
  /** Only movements from or to this item. */
  budgetItemId?: string;
}

/** Manual transfers and computed resets together, in date order (requirements §3.1). */
export function budgetMovements(data: ReportData, query: MovementQuery): BudgetMovement[] {
  assertDateRange(query.from, query.to);
  const versions = loadVersions(data.versions);
  const ledger = ledgerUntil(data, versions, query.to);
  const touches = (fromId: string, toId: string | null) =>
    !query.budgetItemId || fromId === query.budgetItemId || toId === query.budgetItemId;

  const manual: BudgetMovement[] = data.transfers
    .filter((t) => t.occurredOn >= query.from && t.occurredOn <= query.to && touches(t.fromItemId, t.toItemId))
    .sort(compareTransfersOldestFirst)
    .map((t) => ({
      kind: 'manual',
      id: t.id,
      occurredOn: t.occurredOn,
      occurredAt: t.occurredAt,
      fromItemId: t.fromItemId,
      toItemId: t.toItemId,
      amount: t.amount,
      note: t.note,
    }));
  const resets: BudgetMovement[] = ledger.resets
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
  return [...manual, ...resets].sort((a, b) => (a.occurredOn < b.occurredOn ? -1 : a.occurredOn > b.occurredOn ? 1 : 0));
}

/** Oldest first; a transfer without a time counts as the end of its day (ADR 0014). */
export function compareTransfersOldestFirst(
  a: Pick<ReportTransfer, 'occurredOn' | 'occurredAt' | 'createdAt'>,
  b: Pick<ReportTransfer, 'occurredOn' | 'occurredAt' | 'createdAt'>,
): number {
  if (a.occurredOn !== b.occurredOn) return a.occurredOn < b.occurredOn ? -1 : 1;
  if (a.occurredAt !== b.occurredAt) {
    if (a.occurredAt === null) return 1;
    if (b.occurredAt === null) return -1;
    return a.occurredAt < b.occurredAt ? -1 : 1;
  }
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return 0;
}

/** The version in effect for a month; throws NotFoundError when none covers it. */
export function activeVersionOrThrow<V extends { effectiveFromMonth: YearMonth }>(
  versions: readonly V[],
  month: YearMonth,
): V {
  const version = activeVersionFor(versions, month);
  if (!version) throw new NotFoundError(`No plan version covers ${month}.`);
  return version;
}

/** Envelopes and resets of every rollover item up to `until`. */
function ledgerUntil(data: ReportData, versions: readonly LoadedVersion[], until: LocalDate): LedgerResult {
  const first = versions[0]?.effectiveFromMonth;
  if (!first || `${first}-01` > until) return { envelopes: [], resets: [] };
  const from = `${first}-01`;
  const inRange = (date: LocalDate) => date >= from && date <= until;
  return guard(() =>
    computeLedger({
      versions: [...versions],
      spending: data.lines.flatMap((l) =>
        l.type === 'expense' && l.budgetItemId && inRange(l.occurredOn)
          ? [{ budgetItemId: l.budgetItemId, date: l.occurredOn, amount: parseMoney(l.twdAmount) }]
          : [],
      ),
      transfers: [...data.transfers].sort(compareTransfersOldestFirst).flatMap((t) =>
        t.toItemId && inRange(t.occurredOn)
          ? [{ fromItemId: t.fromItemId, toItemId: t.toItemId, date: t.occurredOn, amount: parseMoney(t.amount) }]
          : [],
      ),
      until,
      weekStartDay: data.weekStartDay,
    }),
  );
}

/** Oldest first, converted for the shared-utils math. */
function loadVersions(versions: readonly ReportVersion[]): LoadedVersion[] {
  return [...versions]
    .sort((a, b) => (a.effectiveFromMonth < b.effectiveFromMonth ? -1 : a.effectiveFromMonth > b.effectiveFromMonth ? 1 : 0))
    .map((v) => ({ id: v.id, effectiveFromMonth: v.effectiveFromMonth, items: v.items.map(toPlanItem), data: v.items }));
}

function activeOrThrow(versions: readonly LoadedVersion[], month: YearMonth): LoadedVersion {
  return activeVersionOrThrow(versions, month);
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

function itemFields(item: PlanItemData): ReportItem {
  return {
    budgetItemId: item.budgetItemId,
    name: item.name,
    section: item.section,
    parentItemId: item.parentItemId,
    cadence: item.cadence,
  };
}

function planActual(planned: Cents, transfers: Cents, actual: Cents): PlanActual {
  return {
    planned: formatMoney(planned),
    transfers: formatMoney(transfers),
    actual: formatMoney(actual),
    remaining: formatMoney(planned + transfers - actual),
  };
}

/** The checklist period containing `date`, or null if the item isn't due in it. */
function checklistPeriod(item: PlanItemData, date: LocalDate, weekStartDay: IsoWeekday): Period | null {
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
function subtreesOf(items: readonly PlanItemData[]): Map<string, Set<string>> {
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

function toPlanItem(item: PlanItemData): PlanItem {
  return {
    ...item,
    amount: item.amount === null ? null : parseMoney(item.amount),
    percent: item.percent === null ? null : parsePercent(item.percent),
    overrides: item.overrides.map((o) => ({ month: o.month.slice(0, 7), amount: parseMoney(o.amount) })),
  };
}
