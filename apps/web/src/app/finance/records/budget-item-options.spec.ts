import type { PlanItemDto } from '../data/finance-api';
import { budgetItemGroups, toInputAmount } from './budget-item-options';

const item = (budgetItemId: string, section: PlanItemDto['section'], parentItemId: string | null = null) =>
  ({ budgetItemId, section, name: budgetItemId, parentItemId }) as PlanItemDto;

describe('budgetItemGroups', () => {
  const items = [
    item('salary', 'income'),
    item('food', 'expense'),
    item('daily', 'expense', 'food'),
    item('trip', 'saving'),
  ];

  it('offers Income items for income', () => {
    expect(budgetItemGroups(items, 'income')).toEqual([
      { section: 'income', label: 'Income', items: [{ id: 'salary', name: 'salary', depth: 0 }] },
    ]);
  });

  it('offers every other section for expenses, in section order, with depth', () => {
    const groups = budgetItemGroups(items, 'expense');
    expect(groups.map((g) => g.section)).toEqual(['saving', 'expense']);
    expect(groups[1].items).toEqual([
      { id: 'food', name: 'food', depth: 0 },
      { id: 'daily', name: 'daily', depth: 1 },
    ]);
  });
});

describe('toInputAmount', () => {
  it('drops empty decimals', () => {
    expect(toInputAmount('1200.00')).toBe('1200');
    expect(toInputAmount('12.50')).toBe('12.50');
  });
});
