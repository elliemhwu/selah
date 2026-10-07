import type { PlanItemDto } from '../data/finance-api';

/** A plan item for tests, with every field defaulted. */
export function planItem(budgetItemId: string, fields: Partial<PlanItemDto> = {}): PlanItemDto {
  return {
    budgetItemId,
    section: 'expense',
    name: budgetItemId,
    parentItemId: null,
    cadence: 'monthly',
    cadenceMonth: null,
    cadenceDate: null,
    anchor: 'amount',
    amount: '0.00',
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
