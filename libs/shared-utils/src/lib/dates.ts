import type { IsoWeekday, LocalDate, YearMonth } from '@selah/shared-types';

// Local calendar dates as 'YYYY-MM-DD' strings (ADR 0014). The math works on
// day numbers, so JS Date and time zones never get involved.

export class DateError extends Error {
  override name = 'DateError';
}

interface Ymd {
  year: number;
  month: number; // 1–12
  day: number;
}

function parseYmd(date: LocalDate): Ymd {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match) {
    const [year, month, day] = match.slice(1).map(Number);
    if (month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)) {
      return { year, month, day };
    }
  }
  throw new DateError(`Not a valid date (YYYY-MM-DD): "${date}"`);
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

function formatYmd({ year, month, day }: Ymd): LocalDate {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/** Days since 1970-01-01 (proleptic Gregorian; Howard Hinnant's algorithm). */
export function toDayNumber(date: LocalDate): number {
  const { year, month, day } = parseYmd(date);
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

export function fromDayNumber(dayNumber: number): LocalDate {
  const z = dayNumber + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365,
  );
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const mp = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return formatYmd({ year, month, day });
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** ISO day of week: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: LocalDate): IsoWeekday {
  // 1970-01-01 was a Thursday (4).
  return (((((toDayNumber(date) + 3) % 7) + 7) % 7) + 1) as IsoWeekday;
}

/** The first day of the week containing `date`, for a given week start day. */
export function startOfWeek(date: LocalDate, weekStartDay: IsoWeekday): LocalDate {
  const offset = (isoWeekday(date) - weekStartDay + 7) % 7;
  return addDays(date, -offset);
}

export function endOfWeek(date: LocalDate, weekStartDay: IsoWeekday): LocalDate {
  return addDays(startOfWeek(date, weekStartDay), 6);
}

export function yearMonthOf(date: LocalDate): YearMonth {
  return date.slice(0, 7);
}

export function startOfMonth(date: LocalDate): LocalDate {
  const { year, month } = parseYmd(date);
  return formatYmd({ year, month, day: 1 });
}

export function endOfMonth(date: LocalDate): LocalDate {
  const { year, month } = parseYmd(date);
  return formatYmd({ year, month, day: daysInMonth(year, month) });
}

export function endOfYear(date: LocalDate): LocalDate {
  return `${pad(parseYmd(date).year, 4)}-12-31`;
}

export function parseYearMonth(value: YearMonth): { year: number; month: number } {
  const { year, month } = parseYmd(`${value}-01`);
  return { year, month };
}

/** Number of days from `from` to `to`, inclusive. */
export function daysBetweenInclusive(from: LocalDate, to: LocalDate): number {
  return toDayNumber(to) - toDayNumber(from) + 1;
}

/** The month after `value`: '2026-12' → '2027-01'. */
export function nextYearMonth(value: YearMonth): YearMonth {
  const { year, month } = parseYearMonth(value);
  return month === 12 ? `${pad(year + 1, 4)}-01` : `${pad(year, 4)}-${pad(month + 1, 2)}`;
}
