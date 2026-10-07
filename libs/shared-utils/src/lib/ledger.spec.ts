import { computeLedger, type LedgerInput, type PlanVersionForLedger } from './ledger';
import { parseMoney } from './money';
import type { PlanItem } from './plan';

const twd = parseMoney;

function item(id: string, fields: Partial<PlanItem>): PlanItem {
  return {
    budgetItemId: id,
    section: 'expense',
    parentItemId: null,
    cadence: 'daily',
    cadenceMonth: null,
    cadenceDate: null,
    anchor: 'amount',
    amount: twd('0'),
    percent: null,
    percentBase: 'net_income',
    rollover: true,
    resetCycle: 'never',
    onReset: null,
    carryToItemId: null,
    overrides: [],
    ...fields,
  };
}

function ledger(versions: PlanVersionForLedger[], until: string, extra: Partial<LedgerInput> = {}) {
  return computeLedger({ versions, spending: [], transfers: [], until, weekStartDay: 1, ...extra });
}

const lastLeftover = (result: ReturnType<typeof computeLedger>, id: string) =>
  result.envelopes.filter((e) => e.budgetItemId === id).at(-1)?.periods.at(-1)?.leftover;

// 2026-10-01 is a Thursday; weeks start on Monday.
describe('computeLedger', () => {
  const food = item('food', { amount: twd('185'), resetCycle: 'week', onReset: 'carry', carryToItemId: 'allowance' });
  const allowance = item('allowance', { cadence: 'weekly', amount: twd('500') });

  it('carries Daily Food resets into Weekly Allowance (requirements §3.1)', () => {
    const result = ledger([{ effectiveFromMonth: '2026-10', items: [food, allowance] }], '2026-10-13', {
      spending: [
        { budgetItemId: 'food', date: '2026-10-05', amount: twd('150') },
        { budgetItemId: 'allowance', date: '2026-10-12', amount: twd('200') },
        { budgetItemId: 'food', date: '2026-10-14', amount: twd('999') }, // after `until`
      ],
    });
    expect(result.resets).toEqual([
      // Thursday to Sunday of the first, partial week: 4 × 185.
      { date: '2026-10-04', fromItemId: 'food', toItemId: 'allowance', amount: twd('740') },
      // 7 × 185 − 150.
      { date: '2026-10-11', fromItemId: 'food', toItemId: 'allowance', amount: twd('1145') },
    ]);
    // Monday and Tuesday so far, nothing spent.
    expect(lastLeftover(result, 'food')).toBe(twd('370'));
    // Three weekly allotments (the first and last clipped) + both resets − 200.
    expect(lastLeftover(result, 'allowance')).toBe(twd('3185'));
    const allowancePeriods = result.envelopes.find((e) => e.budgetItemId === 'allowance')?.periods;
    expect(allowancePeriods?.map((p) => [p.start, p.end])).toEqual([
      ['2026-10-01', '2026-10-04'],
      ['2026-10-05', '2026-10-11'],
      ['2026-10-12', '2026-10-13'],
    ]);
  });

  it('settles chains of carries on the same day', () => {
    const a = item('a', { amount: twd('100'), resetCycle: 'week', onReset: 'carry', carryToItemId: 'b' });
    const b = item('b', { amount: twd('10'), resetCycle: 'week', onReset: 'carry', carryToItemId: 'c' });
    const c = item('c', { cadence: 'weekly' });
    const result = ledger([{ effectiveFromMonth: '2026-10', items: [a, b, c] }], '2026-10-11');
    expect(result.resets.map((r) => [r.date, r.fromItemId, r.amount])).toEqual([
      ['2026-10-04', 'a', twd('400')],
      ['2026-10-04', 'b', twd('440')],
      ['2026-10-11', 'a', twd('700')],
      ['2026-10-11', 'b', twd('770')],
    ]);
    expect(lastLeftover(result, 'c')).toBe(twd('1210'));
  });

  it('drops leftovers and carries overspend as a negative reset', () => {
    const daily = item('x', { amount: twd('100'), resetCycle: 'week', onReset: 'drop' });
    const result = ledger([{ effectiveFromMonth: '2026-10', items: [daily] }], '2026-10-11', {
      spending: [{ budgetItemId: 'x', date: '2026-10-05', amount: twd('900') }],
    });
    expect(result.resets).toEqual([
      { date: '2026-10-04', fromItemId: 'x', toItemId: null, amount: twd('400') },
      { date: '2026-10-11', fromItemId: 'x', toItemId: null, amount: twd('-200') },
    ]);
  });

  it('keeps one envelope when only the amount changes between versions', () => {
    const result = ledger(
      [
        { effectiveFromMonth: '2026-10', items: [item('x', { amount: twd('100') })] },
        { effectiveFromMonth: '2026-11', items: [item('x', { amount: twd('200') })] },
      ],
      '2026-11-02',
    );
    expect(result.envelopes).toHaveLength(1);
    expect(lastLeftover(result, 'x')).toBe(twd('3500')); // 31 × 100 + 2 × 200
  });

  it('starts a new envelope when the cadence changes', () => {
    const result = ledger(
      [
        { effectiveFromMonth: '2026-10', items: [item('x', { amount: twd('100') })] },
        { effectiveFromMonth: '2026-11', items: [item('x', { cadence: 'weekly', amount: twd('700') })] },
      ],
      '2026-11-03',
      { spending: [{ budgetItemId: 'x', date: '2026-10-02', amount: twd('100') }] },
    );
    expect(result.envelopes.map((e) => [e.cadence, e.start, e.end])).toEqual([
      ['daily', '2026-10-01', '2026-10-31'],
      ['weekly', '2026-11-01', '2026-11-03'],
    ]);
    // Sunday 11-01 alone, then Monday onwards: two weekly allotments, October's leftover dropped.
    expect(lastLeftover(result, 'x')).toBe(twd('1400'));
  });

  it('starts over after a version without the item', () => {
    const x = item('x', { cadence: 'monthly', amount: twd('1000') });
    const result = ledger(
      [
        { effectiveFromMonth: '2026-10', items: [x] },
        { effectiveFromMonth: '2026-11', items: [] },
        { effectiveFromMonth: '2026-12', items: [x] },
      ],
      '2026-12-15',
    );
    expect(result.envelopes.map((e) => e.start)).toEqual(['2026-10-01', '2026-12-01']);
    expect(lastLeftover(result, 'x')).toBe(twd('1000'));
  });

  it('applies manual transfers up to the as-of date', () => {
    const versions = [
      {
        effectiveFromMonth: '2026-10',
        items: [item('x', { cadence: 'monthly', amount: twd('1000') }), item('y', { cadence: 'monthly' })],
      },
    ];
    const result = ledger(versions, '2026-10-15', {
      transfers: [
        { fromItemId: 'x', toItemId: 'y', date: '2026-10-10', amount: twd('300') },
        { fromItemId: 'x', toItemId: 'y', date: '2026-10-20', amount: twd('50') },
      ],
    });
    expect(lastLeftover(result, 'x')).toBe(twd('700'));
    expect(lastLeftover(result, 'y')).toBe(twd('300'));
  });

  it('uses monthly overrides as allotments', () => {
    const x = item('x', { cadence: 'monthly', amount: twd('1000'), overrides: [{ month: '2026-11', amount: twd('1500') }] });
    const result = ledger([{ effectiveFromMonth: '2026-10', items: [x] }], '2026-11-30');
    expect(result.envelopes[0].periods.map((p) => p.allotment)).toEqual([twd('1000'), twd('1500')]);
  });

  it('is empty before the first version', () => {
    expect(ledger([{ effectiveFromMonth: '2026-10', items: [food] }], '2026-09-30')).toEqual({ envelopes: [], resets: [] });
    expect(ledger([], '2026-09-30')).toEqual({ envelopes: [], resets: [] });
  });
});
