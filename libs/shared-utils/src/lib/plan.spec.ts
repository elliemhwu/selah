import { parseMoney } from './money';
import { parsePercent } from './percent';
import { activeVersionFor, type PlanItem, PlanError, planMonth } from './plan';

const twd = parseMoney;

function planItem(id: string, fields: Partial<PlanItem> = {}): PlanItem {
  return {
    budgetItemId: id,
    section: 'expense',
    parentItemId: null,
    cadence: 'monthly',
    cadenceMonth: null,
    cadenceDate: null,
    anchor: 'amount',
    amount: twd('0'),
    percent: null,
    percentBase: 'net_income',
    rollover: false,
    resetCycle: null,
    onReset: null,
    carryToItemId: null,
    overrides: [],
    ...fields,
  };
}

const percent = (value: string, fields: Partial<PlanItem> = {}): Partial<PlanItem> => ({
  anchor: 'percent',
  amount: null,
  percent: parsePercent(value),
  ...fields,
});

const items: PlanItem[] = [
  planItem('salary', { section: 'income', amount: twd('60000') }),
  planItem('base-pay', { section: 'income', parentItemId: 'salary', amount: twd('55000') }),
  planItem('bonus', { section: 'income', cadence: 'yearly', cadenceMonth: 1, amount: twd('80000') }),
  planItem('tax', { section: 'government', ...percent('5', { percentBase: 'gross_income' }) }),
  planItem('food', percent('12.5')),
  planItem('daily', { parentItemId: 'food', cadence: 'daily', amount: twd('185') }),
  planItem('rent', { amount: twd('15000'), overrides: [{ month: '2026-12', amount: twd('16200') }] }),
  planItem('trip', { section: 'saving', cadence: 'one_time', cadenceDate: '2026-12-20', amount: twd('30000') }),
];

describe('planMonth', () => {
  it('derives the bases from top-level Income and Government items', () => {
    // The base-pay child is part of salary, so it isn't counted again.
    expect(planMonth(items, '2026-10').bases).toEqual({
      grossIncome: twd('60000'),
      government: twd('3000'),
      netIncome: twd('57000'),
    });
  });

  it('resolves percentages against the month, bonus months included', () => {
    expect(planMonth(items, '2026-10').monthlyAmounts.get('food')).toBe(twd('7125'));
    const january = planMonth(items, '2027-01');
    expect(january.bases).toEqual({ grossIncome: twd('140000'), government: twd('7000'), netIncome: twd('133000') });
    expect(january.monthlyAmounts.get('food')).toBe(twd('16625'));
  });

  it('converts cadences and applies overrides to the month only', () => {
    const october = planMonth(items, '2026-10');
    expect(october.periodAmounts.get('daily')).toBe(twd('185'));
    expect(october.monthlyAmounts.get('daily')).toBe(twd('5735'));
    expect(october.monthlyAmounts.get('trip')).toBe(0n);
    const december = planMonth(items, '2026-12');
    expect(december.monthlyAmounts.get('rent')).toBe(twd('16200'));
    expect(december.periodAmounts.get('rent')).toBe(twd('15000'));
    expect(december.monthlyAmounts.get('trip')).toBe(twd('30000'));
  });

  it('rounds percentages to whole TWD', () => {
    const plan = planMonth(
      [planItem('pay', { section: 'income', amount: twd('1001') }), planItem('x', percent('10'))],
      '2026-10',
    );
    expect(plan.monthlyAmounts.get('x')).toBe(twd('100'));
  });

  it.each([
    ['a daily percentage', planItem('x', percent('1', { cadence: 'daily' }))],
    ['a weekly percentage', planItem('x', percent('1', { cadence: 'weekly' }))],
    ['a percentage of income on income', planItem('x', { section: 'income', ...percent('1') })],
    ['Government on net income', planItem('x', { section: 'government', ...percent('1') })],
  ])('rejects %s', (_name, item) => {
    expect(() => planMonth([item], '2026-10')).toThrow(PlanError);
  });
});

describe('activeVersionFor', () => {
  const versions = [{ effectiveFromMonth: '2026-07' }, { effectiveFromMonth: '2026-01' }];

  it('picks the latest version starting on or before the month', () => {
    expect(activeVersionFor(versions, '2026-03')).toBe(versions[1]);
    expect(activeVersionFor(versions, '2026-07')).toBe(versions[0]);
    expect(activeVersionFor(versions, '2030-01')).toBe(versions[0]);
    expect(activeVersionFor(versions, '2025-12')).toBeUndefined();
  });
});
