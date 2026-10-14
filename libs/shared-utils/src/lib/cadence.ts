import type { Cadence, IsoWeekday, LocalDate, YearMonth } from '@selah/shared-types';
import {
  addDays,
  daysInMonth,
  DateError,
  endOfMonth,
  endOfWeek,
  parseYearMonth,
  startOfMonth,
  startOfWeek,
  yearMonthOf,
} from './dates';
import { type Cents, divRound, roundToWholeUnit } from './money';

/** A plan item's amount and when it recurs. `amount` is per cadence period. */
export interface CadenceAmount {
  cadence: Cadence;
  amount: Cents;
  /** 1–12; required for `yearly`. */
  cadenceMonth?: number | null;
  /** Required for `one_time`. */
  cadenceDate?: LocalDate | null;
}

/**
 * What an item contributes to a month's plan (requirements §3):
 * daily × days in the month, weekly × 52 / 12 (rounded to whole TWD),
 * monthly as is (or the month's override), yearly only in its month,
 * one-time only in the month of its date.
 */
export function monthlyAmount(item: CadenceAmount, month: YearMonth, override?: Cents | null): Cents {
  const { year, month: monthNumber } = parseYearMonth(month);
  if (override != null && item.cadence !== 'monthly') {
    throw new DateError(`Only monthly items can be overridden, not ${item.cadence}`);
  }
  switch (item.cadence) {
    case 'daily':
      return item.amount * BigInt(daysInMonth(year, monthNumber));
    case 'weekly':
      return roundToWholeUnit(divRound(item.amount * 52n, 12n));
    case 'monthly':
      return override ?? item.amount;
    case 'yearly':
      if (item.cadenceMonth == null) throw new DateError('A yearly item needs a cadence month');
      return item.cadenceMonth === monthNumber ? item.amount : 0n;
    case 'one_time':
      if (item.cadenceDate == null) throw new DateError('A one-time item needs a cadence date');
      return yearMonthOf(item.cadenceDate) === month ? item.amount : 0n;
  }
}

export interface Period {
  start: LocalDate;
  end: LocalDate;
}

/** The period of a recurring cadence that contains `date`. */
export function periodContaining(
  cadence: 'daily' | 'weekly' | 'monthly',
  date: LocalDate,
  weekStartDay: IsoWeekday,
): Period {
  switch (cadence) {
    case 'daily':
      return { start: date, end: date };
    case 'weekly':
      return { start: startOfWeek(date, weekStartDay), end: endOfWeek(date, weekStartDay) };
    case 'monthly':
      return { start: startOfMonth(date), end: endOfMonth(date) };
  }
}

/**
 * Consecutive cadence periods covering `from`..`to`. The first period may
 * start before `from` and the last may end after `to`, so periods stay
 * aligned to days, weeks (from the week start day) and calendar months.
 */
export function cadencePeriods(
  cadence: 'daily' | 'weekly' | 'monthly',
  from: LocalDate,
  to: LocalDate,
  weekStartDay: IsoWeekday,
): Period[] {
  if (to < from) throw new DateError(`Range ends before it starts: ${from}..${to}`);
  const periods: Period[] = [];
  let period = periodContaining(cadence, from, weekStartDay);
  while (period.start <= to) {
    periods.push(period);
    period = periodContaining(cadence, addDays(period.end, 1), weekStartDay);
  }
  return periods;
}
