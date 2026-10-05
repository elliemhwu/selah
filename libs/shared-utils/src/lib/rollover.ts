import type { IsoWeekday, LocalDate, ResetCycle } from '@selah/shared-types';
import { addDays, DateError, endOfMonth, endOfWeek, endOfYear } from './dates';
import type { Cents } from './money';

// Envelope balances for one rollover item (requirements §3.1, ADR 0011).
// Calculated on read, never stored.

/** One cadence period of the item, with what the plan gives it. */
export interface EnvelopePeriodInput {
  start: LocalDate;
  end: LocalDate;
  /** Planned amount for this period, from the active plan version. */
  allotment: Cents;
}

/** A dated amount: spending (positive = spent) or a budget transfer (positive = in, negative = out). */
export interface DatedAmount {
  date: LocalDate;
  amount: Cents;
}

export interface EnvelopeInput {
  /** Consecutive periods in date order, with no gaps. */
  periods: readonly EnvelopePeriodInput[];
  /** Record lines on this item, in TWD. Lines outside the periods are ignored. */
  spending: readonly DatedAmount[];
  /**
   * Budget transfers touching this item, including resets carried in from
   * other items. Transfers outside the periods are ignored.
   */
  transfers: readonly DatedAmount[];
  resetCycle: ResetCycle;
  weekStartDay: IsoWeekday;
}

export interface EnvelopePeriod {
  start: LocalDate;
  end: LocalDate;
  allotment: Cents;
  /** Leftover (or overspend, if negative) carried in from the previous period. */
  carryIn: Cents;
  transfers: Cents;
  spent: Cents;
  /** carryIn + allotment + transfers − spent. Negative means overspent. */
  leftover: Cents;
}

/**
 * A computed reset: at the end of a reset cycle the leftover (or overspend)
 * leaves the item. Shown in reports as a budget transfer of kind `reset`; the
 * caller applies `on_reset` (drop, or carry into another item).
 */
export interface Reset {
  date: LocalDate;
  amount: Cents;
}

export interface EnvelopeResult {
  periods: EnvelopePeriod[];
  resets: Reset[];
  /** Leftover after the last period, after any reset. */
  balance: Cents;
}

function endOfCycle(date: LocalDate, cycle: Exclude<ResetCycle, 'never'>, weekStartDay: IsoWeekday): LocalDate {
  switch (cycle) {
    case 'week':
      return endOfWeek(date, weekStartDay);
    case 'month':
      return endOfMonth(date);
    case 'year':
      return endOfYear(date);
  }
}

function sumWithin(amounts: readonly DatedAmount[], start: LocalDate, end: LocalDate): Cents {
  let total = 0n;
  for (const { date, amount } of amounts) {
    if (date >= start && date <= end) total += amount;
  }
  return total;
}

export function computeEnvelope(input: EnvelopeInput): EnvelopeResult {
  const { periods, spending, transfers, resetCycle, weekStartDay } = input;
  const result: EnvelopePeriod[] = [];
  const resets: Reset[] = [];
  let carry = 0n;

  periods.forEach((period, index) => {
    if (period.end < period.start) {
      throw new DateError(`Period ends before it starts: ${period.start}..${period.end}`);
    }
    if (index > 0 && period.start !== addDays(periods[index - 1].end, 1)) {
      throw new DateError(`Periods must be consecutive: gap or overlap before ${period.start}`);
    }

    const spent = sumWithin(spending, period.start, period.end);
    const moved = sumWithin(transfers, period.start, period.end);
    const leftover = carry + period.allotment + moved - spent;
    result.push({ ...period, carryIn: carry, transfers: moved, spent, leftover });
    carry = leftover;

    if (resetCycle !== 'never') {
      const cycleEnd = endOfCycle(period.start, resetCycle, weekStartDay);
      if (period.end > cycleEnd) {
        throw new DateError(
          `A ${resetCycle} reset can't apply to a period longer than a ${resetCycle} (${period.start}..${period.end})`,
        );
      }
      if (period.end === cycleEnd) {
        if (leftover !== 0n) resets.push({ date: period.end, amount: leftover });
        carry = 0n;
      }
    }
  });

  return { periods: result, resets, balance: carry };
}
