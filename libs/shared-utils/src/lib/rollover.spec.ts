import { cadencePeriods } from './cadence';
import { DateError } from './dates';
import { parseMoney } from './money';
import { computeEnvelope, type EnvelopePeriodInput } from './rollover';

const twd = parseMoney;

function days(from: string, to: string, allotment: string): EnvelopePeriodInput[] {
  return cadencePeriods('daily', from, to, 1).map((p) => ({ ...p, allotment: twd(allotment) }));
}

describe('computeEnvelope', () => {
  it('carries leftover into the next day', () => {
    // Daily Food 185, 150 spent on day 1 → 35 left, so day 2 has 185 + 35 = 220.
    const result = computeEnvelope({
      periods: days('2026-10-05', '2026-10-06', '185'),
      spending: [{ date: '2026-10-05', amount: twd('150') }],
      transfers: [],
      resetCycle: 'never',
      weekStartDay: 1,
    });
    expect(result.periods[0].leftover).toBe(twd('35'));
    expect(result.periods[1].carryIn).toBe(twd('35'));
    expect(result.periods[1].carryIn + result.periods[1].allotment).toBe(twd('220'));
    expect(result.balance).toBe(twd('220'));
  });

  it('carries overspend too', () => {
    const result = computeEnvelope({
      periods: days('2026-10-05', '2026-10-06', '185'),
      spending: [{ date: '2026-10-05', amount: twd('300') }],
      transfers: [],
      resetCycle: 'never',
      weekStartDay: 1,
    });
    expect(result.periods[0].leftover).toBe(twd('-115'));
    expect(result.balance).toBe(twd('70'));
  });

  it('resets at the end of the week and reports the reset', () => {
    // Monday 2026-10-05 to Tuesday 2026-10-13, weeks start Monday.
    const result = computeEnvelope({
      periods: days('2026-10-05', '2026-10-13', '100'),
      spending: [
        { date: '2026-10-05', amount: twd('80') },
        { date: '2026-10-12', amount: twd('30') },
      ],
      transfers: [],
      resetCycle: 'week',
      weekStartDay: 1,
    });
    // Week 1: 7 × 100 − 80 = 620, reset on Sunday 2026-10-11.
    expect(result.resets).toEqual([{ date: '2026-10-11', amount: twd('620') }]);
    expect(result.periods[7]).toMatchObject({ start: '2026-10-12', carryIn: 0n });
    // Week 2 so far: 2 × 100 − 30.
    expect(result.balance).toBe(twd('170'));
  });

  it('follows the week start day', () => {
    const result = computeEnvelope({
      periods: days('2026-10-05', '2026-10-11', '10'),
      spending: [],
      transfers: [],
      resetCycle: 'week',
      weekStartDay: 7, // weeks run Sunday–Saturday
    });
    expect(result.resets).toEqual([{ date: '2026-10-10', amount: twd('60') }]);
    expect(result.balance).toBe(twd('10'));
  });

  it('includes budget transfers in and out', () => {
    const result = computeEnvelope({
      periods: cadencePeriods('monthly', '2026-09-01', '2026-10-31', 1).map((p) => ({
        ...p,
        allotment: twd('2000'),
      })),
      spending: [{ date: '2026-09-10', amount: twd('1200') }],
      transfers: [
        { date: '2026-09-30', amount: twd('-500') }, // leftover moved to Travel
        { date: '2026-10-02', amount: twd('300') },
      ],
      resetCycle: 'never',
      weekStartDay: 1,
    });
    expect(result.periods[0].leftover).toBe(twd('300'));
    expect(result.balance).toBe(twd('2600'));
  });

  it('drops a zero leftover without a reset row', () => {
    const result = computeEnvelope({
      periods: days('2026-10-05', '2026-10-11', '10'),
      spending: [{ date: '2026-10-08', amount: twd('70') }],
      transfers: [],
      resetCycle: 'week',
      weekStartDay: 1,
    });
    expect(result.resets).toEqual([]);
    expect(result.balance).toBe(0n);
  });

  it('feeds a carried reset into the next item (Daily Food → Weekly Allowance)', () => {
    const food = computeEnvelope({
      periods: days('2026-10-05', '2026-10-11', '185'),
      spending: [{ date: '2026-10-06', amount: twd('1000') }],
      transfers: [],
      resetCycle: 'week',
      weekStartDay: 1,
    });
    // 7 × 185 − 1000 = 295, carried into the allowance.
    expect(food.resets).toEqual([{ date: '2026-10-11', amount: twd('295') }]);

    const allowance = computeEnvelope({
      periods: cadencePeriods('weekly', '2026-10-05', '2026-10-18', 1).map((p) => ({
        ...p,
        allotment: twd('500'),
      })),
      spending: [{ date: '2026-10-15', amount: twd('200') }],
      transfers: food.resets,
      resetCycle: 'never',
      weekStartDay: 1,
    });
    expect(allowance.balance).toBe(twd('1095')); // 500 + 295 + 500 − 200
  });

  it('ignores movements outside the periods', () => {
    const result = computeEnvelope({
      periods: days('2026-10-05', '2026-10-05', '100'),
      spending: [{ date: '2026-10-04', amount: twd('999') }],
      transfers: [{ date: '2026-10-06', amount: twd('999') }],
      resetCycle: 'never',
      weekStartDay: 1,
    });
    expect(result.balance).toBe(twd('100'));
  });

  it('rejects gaps, and periods longer than the reset cycle', () => {
    expect(() =>
      computeEnvelope({
        periods: [
          { start: '2026-10-05', end: '2026-10-05', allotment: 0n },
          { start: '2026-10-07', end: '2026-10-07', allotment: 0n },
        ],
        spending: [],
        transfers: [],
        resetCycle: 'never',
        weekStartDay: 1,
      }),
    ).toThrow(DateError);

    expect(() =>
      computeEnvelope({
        periods: [{ start: '2026-10-01', end: '2026-10-31', allotment: 0n }],
        spending: [],
        transfers: [],
        resetCycle: 'week',
        weekStartDay: 1,
      }),
    ).toThrow(DateError);
  });
});
