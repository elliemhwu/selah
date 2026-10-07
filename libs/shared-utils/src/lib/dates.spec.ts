import {
  addDays,
  DateError,
  daysBetweenInclusive,
  daysInMonth,
  endOfMonth,
  endOfWeek,
  endOfYear,
  fromDayNumber,
  isoWeekday,
  nextYearMonth,
  previousYearMonth,
  startOfMonth,
  startOfWeek,
  toDayNumber,
} from './dates';

describe('dates', () => {
  it('converts between dates and day numbers', () => {
    expect(toDayNumber('1970-01-01')).toBe(0);
    expect(toDayNumber('2000-03-01')).toBe(11017);
    expect(fromDayNumber(-1)).toBe('1969-12-31');
    for (let n = 19000; n < 21000; n += 37) {
      expect(toDayNumber(fromDayNumber(n))).toBe(n);
    }
  });

  it('adds days across months, years and leap days', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('knows month lengths', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
  });

  it('gives the ISO weekday', () => {
    expect(isoWeekday('2026-10-05')).toBe(1); // Monday
    expect(isoWeekday('2026-10-11')).toBe(7); // Sunday
    expect(isoWeekday('1970-01-01')).toBe(4); // Thursday
  });

  it('finds weeks for any week start day', () => {
    // Wednesday 2026-10-07
    expect(startOfWeek('2026-10-07', 1)).toBe('2026-10-05');
    expect(endOfWeek('2026-10-07', 1)).toBe('2026-10-11');
    expect(startOfWeek('2026-10-07', 7)).toBe('2026-10-04');
    expect(endOfWeek('2026-10-07', 7)).toBe('2026-10-10');
    expect(startOfWeek('2026-10-05', 1)).toBe('2026-10-05');
  });

  it('finds month and year boundaries', () => {
    expect(startOfMonth('2026-10-17')).toBe('2026-10-01');
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29');
    expect(endOfYear('2026-05-05')).toBe('2026-12-31');
    expect(daysBetweenInclusive('2026-10-01', '2026-10-31')).toBe(31);
  });

  it('steps to the next month', () => {
    expect(nextYearMonth('2026-10')).toBe('2026-11');
    expect(nextYearMonth('2026-12')).toBe('2027-01');
    expect(previousYearMonth('2027-01')).toBe('2026-12');
    expect(previousYearMonth('2026-10')).toBe('2026-09');
  });

  it.each(['2026-02-29', '2026-13-01', '2026-1-01', '20261001', ''])('rejects "%s"', (date) => {
    expect(() => toDayNumber(date)).toThrow(DateError);
  });
});
