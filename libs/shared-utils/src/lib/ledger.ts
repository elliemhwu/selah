import type { IsoWeekday, LocalDate, ResetCycle, YearMonth } from '@selah/shared-types';
import { cadencePeriods } from './cadence';
import { endOfMonth, nextYearMonth, yearMonthOf } from './dates';
import type { Cents } from './money';
import { activeVersionFor, type MonthPlan, type PlanItem, planMonth, PlanError } from './plan';
import { computeEnvelope, type DatedAmount, type EnvelopePeriod, type EnvelopePeriodInput, type Reset } from './rollover';

// Envelopes of every rollover item across plan versions, with resets carried
// between items (requirements §3.1, ADR 0011, 0019). Calculated on read.

export interface PlanVersionForLedger {
  /** 'YYYY-MM' */
  effectiveFromMonth: YearMonth;
  items: readonly PlanItem[];
}

/** An expense line on a budget item, in TWD. */
export interface ItemSpending {
  budgetItemId: string;
  date: LocalDate;
  amount: Cents;
}

/** A stored manual budget transfer. */
export interface ItemTransfer {
  fromItemId: string;
  toItemId: string;
  date: LocalDate;
  amount: Cents;
}

export interface LedgerInput {
  versions: readonly PlanVersionForLedger[];
  spending: readonly ItemSpending[];
  transfers: readonly ItemTransfer[];
  /** Calculate as of this day: periods end here and later amounts are ignored. */
  until: LocalDate;
  weekStartDay: IsoWeekday;
}

/** A reset as a budget transfer of kind `reset`. A negative amount carries an overspend. */
export interface ComputedReset {
  date: LocalDate;
  fromItemId: string;
  /** Null when the leftover is dropped. */
  toItemId: string | null;
  amount: Cents;
}

/**
 * One continuous envelope of an item: consecutive months in which the active
 * version has it with rollover on and the same cadence and reset cycle.
 */
export interface LedgerEnvelope {
  budgetItemId: string;
  cadence: 'daily' | 'weekly' | 'monthly';
  resetCycle: ResetCycle;
  start: LocalDate;
  end: LocalDate;
  periods: EnvelopePeriod[];
  resets: Reset[];
}

export interface LedgerResult {
  /** Every envelope, in start order per item. */
  envelopes: LedgerEnvelope[];
  /** Every computed reset, in date order. */
  resets: ComputedReset[];
}

interface Run {
  budgetItemId: string;
  cadence: 'daily' | 'weekly' | 'monthly';
  resetCycle: ResetCycle;
  firstMonth: YearMonth;
  lastMonth: YearMonth;
}

export function computeLedger(input: LedgerInput): LedgerResult {
  const { versions, until, weekStartDay } = input;
  const plans = new MonthPlans(versions);
  const runs = findRuns(versions, yearMonthOf(until));

  const envelopeInputs = runs.map((run) => {
    const start = `${run.firstMonth}-01`;
    const runEnd = endOfMonth(`${run.lastMonth}-01`);
    const end = runEnd < until ? runEnd : until;
    const periods: EnvelopePeriodInput[] = cadencePeriods(run.cadence, start, end, weekStartDay).map((p) => {
      const clipped = { start: p.start < start ? start : p.start, end: p.end > end ? end : p.end };
      const plan = plans.for(yearMonthOf(clipped.start));
      const amounts = run.cadence === 'monthly' ? plan?.monthlyAmounts : plan?.periodAmounts;
      return { ...clipped, allotment: amounts?.get(run.budgetItemId) ?? 0n };
    });
    return { run, start, end, periods };
  });

  const spending = new Map<string, DatedAmount[]>();
  for (const s of input.spending) push(spending, s.budgetItemId, s);
  const manual = new Map<string, DatedAmount[]>();
  for (const t of input.transfers) {
    push(manual, t.fromItemId, { date: t.date, amount: -t.amount });
    push(manual, t.toItemId, { date: t.date, amount: t.amount });
  }

  // A reset carried into another item changes that item's envelope, and so its
  // own resets. Repeat until nothing changes; carry chains have no loops within
  // a version, so this settles in at most one pass per envelope.
  let carried = new Map<string, DatedAmount[]>();
  let previous = '';
  for (let pass = 0; pass <= runs.length + 1; pass++) {
    const envelopes: LedgerEnvelope[] = [];
    const resets: ComputedReset[] = [];
    for (const { run, start, end, periods } of envelopeInputs) {
      const result = computeEnvelope({
        periods,
        spending: spending.get(run.budgetItemId) ?? [],
        transfers: [...(manual.get(run.budgetItemId) ?? []), ...(carried.get(run.budgetItemId) ?? [])],
        resetCycle: run.resetCycle,
        weekStartDay,
      });
      envelopes.push({ ...run, start, end, periods: result.periods, resets: result.resets });
      for (const reset of result.resets) {
        const item = activeVersionFor(versions, yearMonthOf(reset.date))?.items.find(
          (i) => i.budgetItemId === run.budgetItemId,
        );
        const toItemId = item?.onReset === 'carry' ? item.carryToItemId : null;
        resets.push({ date: reset.date, fromItemId: run.budgetItemId, toItemId, amount: reset.amount });
      }
    }
    resets.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const signature = resets.map((r) => `${r.date}|${r.fromItemId}|${r.toItemId}|${r.amount}`).join(';');
    if (signature === previous) return { envelopes, resets };
    previous = signature;
    carried = new Map();
    for (const r of resets) if (r.toItemId) push(carried, r.toItemId, { date: r.date, amount: r.amount });
  }
  throw new PlanError('Carried resets never settle: a carry chain loops.');
}

/** Envelope runs per rollover item, from the first version up to `lastMonth`. */
function findRuns(versions: readonly PlanVersionForLedger[], lastMonth: YearMonth): Run[] {
  const first = versions.reduce<YearMonth | undefined>(
    (min, v) => (min === undefined || v.effectiveFromMonth < min ? v.effectiveFromMonth : min),
    undefined,
  );
  const runs: Run[] = [];
  const open = new Map<string, Run>();
  for (let month = first; month !== undefined && month <= lastMonth; month = nextYearMonth(month)) {
    const version = activeVersionFor(versions, month);
    const seen = new Set<string>();
    for (const item of version?.items ?? []) {
      if (!item.rollover || item.resetCycle === null) continue;
      if (item.cadence !== 'daily' && item.cadence !== 'weekly' && item.cadence !== 'monthly') {
        throw new PlanError(`A ${item.cadence} item can't roll over`);
      }
      seen.add(item.budgetItemId);
      const run = open.get(item.budgetItemId);
      if (run && run.cadence === item.cadence && run.resetCycle === item.resetCycle) {
        run.lastMonth = month;
      } else {
        const started: Run = {
          budgetItemId: item.budgetItemId,
          cadence: item.cadence,
          resetCycle: item.resetCycle,
          firstMonth: month,
          lastMonth: month,
        };
        runs.push(started);
        open.set(item.budgetItemId, started);
      }
    }
    for (const id of [...open.keys()]) if (!seen.has(id)) open.delete(id);
  }
  return runs;
}

/** planMonth() for the version active in each month, calculated once. */
class MonthPlans {
  private readonly cache = new Map<YearMonth, MonthPlan | undefined>();
  constructor(private readonly versions: readonly PlanVersionForLedger[]) {}

  for(month: YearMonth): MonthPlan | undefined {
    if (!this.cache.has(month)) {
      const version = activeVersionFor(this.versions, month);
      this.cache.set(month, version && planMonth(version.items, month));
    }
    return this.cache.get(month);
  }
}

function push(map: Map<string, DatedAmount[]>, key: string, value: DatedAmount): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
