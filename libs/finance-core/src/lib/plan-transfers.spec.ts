import type { Section } from '@selah/shared-types';
import { assertBudgetTransferDeletable, prepareBudgetTransfer } from './budget-transfers';
import { ConflictError, RuleViolationError } from './errors';
import { assertPlanVersionDeletable, type PlanItemInput, preparePlanVersion } from './plan-versions';

const errorsOf = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    if (error instanceof RuleViolationError) return error.errors;
    throw error;
  }
  return undefined;
};

describe('preparePlanVersion', () => {
  const item = (budgetItemId: string, fields: Partial<PlanItemInput> = {}): PlanItemInput => ({
    budgetItemId,
    section: 'expense',
    name: budgetItemId,
    cadence: 'monthly',
    anchor: 'amount',
    amount: '1000',
    ...fields,
  });
  const context = { knownSections: new Map<string, Section>() };

  it('normalises items, filling the defaults', () => {
    const values = preparePlanVersion('v1', { effectiveFromMonth: '2026-10', note: ' ', items: [item('rent', { name: ' Rent ' })] }, context);
    expect(values).toEqual({
      effectiveFromMonth: '2026-10',
      note: null,
      items: [
        {
          budgetItemId: 'rent',
          section: 'expense',
          name: 'Rent',
          parentItemId: null,
          cadence: 'monthly',
          cadenceMonth: null,
          cadenceDate: null,
          anchor: 'amount',
          amount: '1000.00',
          percent: null,
          percentBase: 'net_income',
          rollover: false,
          resetCycle: null,
          onReset: null,
          carryToItemId: null,
          overrides: [],
        },
      ],
    });
  });

  it('keeps an item in its section, versions in order, and carries free of loops', () => {
    const errors = errorsOf(() =>
      preparePlanVersion(
        'v2',
        {
          effectiveFromMonth: '2026-09',
          items: [
            item('rent', { section: 'saving' }),
            item('a', { cadence: 'daily', rollover: true, resetCycle: 'week', onReset: 'carry', carryToItemId: 'b' }),
            item('b', { cadence: 'daily', rollover: true, resetCycle: 'week', onReset: 'carry', carryToItemId: 'a' }),
          ],
        },
        { knownSections: new Map<string, Section>([['rent', 'expense']]), previous: { effectiveFromMonth: '2026-10' } },
      ),
    );
    expect(errors).toEqual({
      effectiveFromMonth: ['A new version must start after 2026-10.'],
      'items.0.section': ["This item belongs to expense; an item can't change section. Create a new item instead."],
      'items.1.carryToItemId': ['These carries form a loop.'],
      'items.2.carryToItemId': ['These carries form a loop.'],
    });
  });

  it('only changes or deletes the newest version', () => {
    const older = { existing: { deletedAt: null }, newest: { id: 'v2' }, knownSections: new Map<string, Section>() };
    expect(() => preparePlanVersion('v1', { effectiveFromMonth: '2026-01', items: [] }, older)).toThrow(ConflictError);
    expect(() => assertPlanVersionDeletable('v1', { id: 'v2' })).toThrow(ConflictError);
    expect(() => assertPlanVersionDeletable('v2', { id: 'v2' })).not.toThrow();
  });
});

describe('prepareBudgetTransfer', () => {
  const sections = new Map<string, Section>([
    ['allowance', 'expense'],
    ['travel', 'saving'],
    ['salary', 'income'],
  ]);
  const input = { occurredOn: '2026-09-30', fromItemId: 'allowance', toItemId: 'travel', amount: '500', note: ' ' };

  it('normalises a transfer', () => {
    expect(prepareBudgetTransfer('t1', input, { sections })).toEqual({
      occurredOn: '2026-09-30',
      occurredAt: null,
      fromItemId: 'allowance',
      toItemId: 'travel',
      amount: '500.00',
      note: null,
    });
  });

  it('keeps income out, budgets whole, and stored resets read-only', () => {
    expect(errorsOf(() => prepareBudgetTransfer('t1', { ...input, toItemId: 'salary', amount: '0.5' }, { sections }))).toEqual({
      toItemId: ['Income items are not budgets; they take no transfers (ADR 0019).'],
      amount: ['Budgets are whole TWD.'],
    });
    expect(() => prepareBudgetTransfer('t1', input, { sections, existing: { kind: 'reset', deletedAt: null } })).toThrow(ConflictError);
    expect(() => assertBudgetTransferDeletable('reset')).toThrow(ConflictError);
  });
});
