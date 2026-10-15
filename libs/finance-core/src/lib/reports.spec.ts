import { NotFoundError } from './errors';
import type { PlanItemData } from './plan-versions';
import {
  budgetMovements,
  checklistReport,
  compareTransfersOldestFirst,
  envelopesReport,
  monthlyReview,
  type ReportData,
  type ReportLine,
  type ReportTransfer,
} from './reports';

// The API's integration tests check the reports in depth through HTTP. These
// check that the shared functions read plain values the way the API loads
// them, so the device gets the same numbers (ADR 0025).

const item = (budgetItemId: string, fields: Partial<PlanItemData> = {}): PlanItemData => ({
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
});
const line = (type: ReportLine['type'], occurredOn: string, twdAmount: string, budgetItemId: string | null): ReportLine => ({
  type,
  occurredOn,
  twdAmount,
  budgetItemId,
});
const transfer = (id: string, occurredOn: string, fields: Partial<ReportTransfer> = {}): ReportTransfer => ({
  id,
  occurredOn,
  occurredAt: null,
  fromItemId: 'rent',
  toItemId: 'allowance',
  amount: '300.00',
  note: null,
  createdAt: `${occurredOn}T00:00:00Z`,
  ...fields,
});

// 2026-10-01 is a Thursday; weeks start on Monday.
const data: ReportData = {
  versions: [
    {
      id: 'v1',
      effectiveFromMonth: '2026-10',
      items: [
        item('salary', { section: 'income', amount: '60000.00' }),
        item('rent', { amount: '15000.00' }),
        item('allowance', { cadence: 'weekly', amount: '500.00', rollover: true, resetCycle: 'never' }),
      ],
    },
  ],
  lines: [
    line('income', '2026-10-05', '60000.00', 'salary'),
    line('expense', '2026-10-01', '15000.00', 'rent'),
    line('expense', '2026-10-06', '200.00', 'allowance'),
    line('expense', '2026-10-06', '99.00', null),
    // After the month: ignored by October's review.
    line('expense', '2026-11-02', '1.00', 'rent'),
  ],
  transfers: [transfer('t1', '2026-10-08')],
  weekStartDay: 1,
};

describe('reports', () => {
  it("shows what's left in an envelope, with transfers in", () => {
    const [allowance] = envelopesReport(data, '2026-10-13');
    // Week 1 (Thu–Sun): 500 · week 2: 500 − 200 + 300 · week 3: 500.
    expect(allowance).toMatchObject({
      budgetItemId: 'allowance',
      period: { start: '2026-10-12', end: '2026-10-18' },
      carryIn: '1100.00',
      available: '1600.00',
    });
  });

  it('marks checklist items done when a line covers the period', () => {
    expect(checklistReport(data, '2026-10-13').map((c) => [c.budgetItemId, c.done, c.recorded])).toEqual([
      ['salary', true, '60000.00'],
      ['rent', true, '15000.00'],
    ]);
  });

  it('compares plan and actual for a month', () => {
    const review = monthlyReview(data, '2026-10');
    const rent = review.items.find((i) => i.budgetItemId === 'rent');
    expect(rent).toMatchObject({ planned: '15000.00', transfers: '-300.00', actual: '15000.00', remaining: '-300.00' });
    expect(review.unplanned).toEqual({ income: '0.00', expense: '99.00' });
  });

  it('lists manual transfers by date and time, for one item if asked', () => {
    const more = {
      ...data,
      transfers: [
        transfer('late', '2026-10-08', { occurredAt: null, createdAt: '2026-10-08T01:00:00Z' }),
        transfer('t1', '2026-10-08', { occurredAt: '09:00' }),
        transfer('other', '2026-10-09', { fromItemId: 'salary', toItemId: 'salary' }),
      ],
    };
    const movements = budgetMovements(more, { from: '2026-10-01', to: '2026-10-31', budgetItemId: 'rent' });
    expect(movements.map((m) => m.id)).toEqual(['t1', 'late']);
  });

  it('orders transfers without a time last in their day', () => {
    const a = transfer('a', '2026-10-08', { occurredAt: null });
    const b = transfer('b', '2026-10-08', { occurredAt: '23:00' });
    expect([a, b].sort(compareTransfersOldestFirst).map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('needs a plan covering the date', () => {
    expect(() => envelopesReport(data, '2026-09-30')).toThrow(NotFoundError);
  });
});
