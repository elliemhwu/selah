import { planItem } from './plan-item.testing';
import { buildPlanView, treeRows } from './plan-view';

const items = [
  planItem('salary', { section: 'income', amount: '60000.00' }),
  planItem('bonus', { section: 'income', cadence: 'yearly', cadenceMonth: 1, amount: '80000.00' }),
  planItem('tax', { section: 'government', anchor: 'percent', amount: null, percent: '5.0000', percentBase: 'gross_income' }),
  planItem('food', { anchor: 'percent', amount: null, percent: '12.5000' }),
  planItem('rent', { amount: '15000.00', overrides: [{ month: '2026-12', amount: '16200.00' }] }),
  planItem('daily', { parentItemId: 'food', cadence: 'daily', amount: '185.00' }),
  planItem('tithe', { section: 'offering', anchor: 'percent', amount: null, percent: '10.0000' }),
];

describe('treeRows', () => {
  it('puts children right after their parent', () => {
    expect(treeRows(items).map((r) => [r.item.budgetItemId, r.depth])).toEqual([
      ['salary', 0],
      ['bonus', 0],
      ['tax', 0],
      ['food', 0],
      ['daily', 1],
      ['rent', 0],
      ['tithe', 0],
    ]);
  });
});

describe('buildPlanView', () => {
  it('shows the month: totals of top-level items, shares and unallocated', () => {
    const view = buildPlanView(items, '2026-10');
    expect(view.error).toBeNull();
    expect(view.netIncome).toBe('57000.00');
    const expense = view.sections.find((s) => s.section === 'expense');
    expect(expense?.rows.map((r) => [r.item.budgetItemId, r.monthly])).toEqual([
      ['food', '7125.00'],
      ['daily', '5735.00'],
      ['rent', '15000.00'],
    ]);
    expect(expense?.total).toBe('22125.00'); // Daily Food is part of Food
    expect(expense?.share).toBe('38.8158');
    expect(view.sections.find((s) => s.section === 'income')?.share).toBeNull();
    // 57,000 − 5,700 tithe − 22,125 expenses
    expect(view.unallocated).toBe('29175.00');
    expect(view.unallocatedShare).toBe('51.1842');
  });

  it('follows overrides and yearly items by month', () => {
    const december = buildPlanView(items, '2026-12');
    expect(december.sections.find((s) => s.section === 'expense')?.rows.find((r) => r.item.budgetItemId === 'rent')?.monthly).toBe('16200.00');
    const january = buildPlanView(items, '2027-01');
    expect(january.netIncome).toBe('133000.00');
  });

  it('keeps the rows when the plan breaks a rule', () => {
    const view = buildPlanView([...items, planItem('coffee', { cadence: 'daily', anchor: 'percent', amount: null, percent: '1.0000' })], '2026-10');
    expect(view.error).toContain("can't be a percentage");
    expect(view.netIncome).toBeNull();
    expect(view.sections.find((s) => s.section === 'expense')?.rows).toHaveLength(4);
  });
});
