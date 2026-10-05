import { cadencePeriods, monthlyAmount } from './cadence';
import { DateError } from './dates';
import { parseMoney } from './money';

const twd = parseMoney;

describe('monthlyAmount', () => {
  it('multiplies daily items by the days in the month', () => {
    expect(monthlyAmount({ cadence: 'daily', amount: twd('185') }, '2026-10')).toBe(twd('5735'));
    expect(monthlyAmount({ cadence: 'daily', amount: twd('185') }, '2024-02')).toBe(twd('5365'));
  });

  it('converts weekly items as × 52 / 12, rounded to whole TWD', () => {
    // 1,000 × 52 / 12 = 4,333.33 → 4,333
    expect(monthlyAmount({ cadence: 'weekly', amount: twd('1000') }, '2026-10')).toBe(twd('4333'));
    // 1,500 × 52 / 12 = 6,500
    expect(monthlyAmount({ cadence: 'weekly', amount: twd('1500') }, '2026-10')).toBe(twd('6500'));
  });

  it('uses the monthly amount, or the month override', () => {
    const rent = { cadence: 'monthly' as const, amount: twd('15000') };
    expect(monthlyAmount(rent, '2026-10')).toBe(twd('15000'));
    expect(monthlyAmount(rent, '2026-10', twd('16200'))).toBe(twd('16200'));
  });

  it('only counts yearly and one-time items in their month', () => {
    const bonus = { cadence: 'yearly' as const, amount: twd('80000'), cadenceMonth: 1 };
    expect(monthlyAmount(bonus, '2027-01')).toBe(twd('80000'));
    expect(monthlyAmount(bonus, '2026-10')).toBe(0n);

    const trip = { cadence: 'one_time' as const, amount: twd('30000'), cadenceDate: '2026-12-20' };
    expect(monthlyAmount(trip, '2026-12')).toBe(twd('30000'));
    expect(monthlyAmount(trip, '2027-12')).toBe(0n);
  });

  it('rejects overrides on non-monthly items and missing cadence fields', () => {
    expect(() => monthlyAmount({ cadence: 'weekly', amount: 1n }, '2026-10', 5n)).toThrow(DateError);
    expect(() => monthlyAmount({ cadence: 'yearly', amount: 1n }, '2026-10')).toThrow(DateError);
    expect(() => monthlyAmount({ cadence: 'one_time', amount: 1n }, '2026-10')).toThrow(DateError);
  });
});

describe('cadencePeriods', () => {
  it('lists days', () => {
    expect(cadencePeriods('daily', '2026-10-30', '2026-11-01', 1)).toEqual([
      { start: '2026-10-30', end: '2026-10-30' },
      { start: '2026-10-31', end: '2026-10-31' },
      { start: '2026-11-01', end: '2026-11-01' },
    ]);
  });

  it('aligns weeks to the week start day', () => {
    expect(cadencePeriods('weekly', '2026-10-07', '2026-10-13', 1)).toEqual([
      { start: '2026-10-05', end: '2026-10-11' },
      { start: '2026-10-12', end: '2026-10-18' },
    ]);
  });

  it('aligns months to the calendar', () => {
    expect(cadencePeriods('monthly', '2026-11-15', '2027-01-02', 1)).toEqual([
      { start: '2026-11-01', end: '2026-11-30' },
      { start: '2026-12-01', end: '2026-12-31' },
      { start: '2027-01-01', end: '2027-01-31' },
    ]);
  });

  it('rejects reversed ranges', () => {
    expect(() => cadencePeriods('daily', '2026-10-02', '2026-10-01', 1)).toThrow(DateError);
  });
});
