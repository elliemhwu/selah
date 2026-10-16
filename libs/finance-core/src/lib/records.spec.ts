import type { Currency, Section } from '@selah/shared-types';
import { RuleViolationError } from './errors';
import {
  compareRecordsNewestFirst,
  lastUsedRates,
  type ListedRecord,
  matchesRecordFilters,
  prepareRecords,
  type RecordInput,
  type RecordLookups,
  referencedIds,
} from './records';

const lookups: RecordLookups = {
  accounts: new Map<string, { currency: Currency }>([
    ['cash', { currency: 'TWD' }],
    ['yen', { currency: 'JPY' }],
  ]),
  categories: new Set(['food']),
  budgetItems: new Map<string, { section: Section }>([
    ['salary', { section: 'income' }],
    ['lunch', { section: 'expense' }],
  ]),
};
const expense = (fields: Partial<RecordInput> = {}): RecordInput => ({
  id: 'r1',
  type: 'expense',
  occurredOn: '2026-10-12',
  accountId: 'cash',
  currency: 'TWD',
  lines: [{ id: 'l1', amount: '185', budgetItemId: 'lunch', categoryId: 'food', note: ' ' }],
  ...fields,
});

/** The field errors a call throws, or undefined if it doesn't throw one. */
function fieldErrors(run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (error instanceof RuleViolationError) return error.errors;
    throw error;
  }
  return undefined;
}

describe('prepareRecords', () => {
  it('normalises a TWD expense', () => {
    const [write] = prepareRecords([expense({ note: '  ' })], lookups);
    expect(write).toEqual({
      id: 'r1',
      type: 'expense',
      occurredOn: '2026-10-12',
      occurredAt: null,
      accountId: 'cash',
      currency: 'TWD',
      counterAccountId: null,
      counterAmount: null,
      targetBalance: null,
      note: null,
      lines: [
        { id: 'l1', amount: '185.00', twdAmount: '185.00', fxRate: null, categoryId: 'food', budgetItemId: 'lunch', note: null, sortOrder: 0 },
      ],
    });
  });

  it('works out the TWD amount of a foreign line, and gives a new line an id', () => {
    const [write] = prepareRecords(
      [expense({ currency: 'JPY', lines: [{ amount: '1200', fxRate: '0.21', budgetItemId: 'lunch' }] })],
      lookups,
    );
    expect(write.lines[0]).toMatchObject({ amount: '1200.00', twdAmount: '252.00', fxRate: '0.21000000' });
    expect(write.lines[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('collects every problem, prefixed per record in a batch', () => {
    const errors = fieldErrors(() =>
      prepareRecords(
        [
          expense(),
          expense({
            id: 'r2',
            occurredOn: '2026-02-30',
            accountId: 'yen',
            lines: [{ id: 'l2', amount: '0', budgetItemId: 'salary' }],
          }),
        ],
        lookups,
        (i) => `records.${i}.`,
      ),
    );
    expect(errors).toEqual({
      'records.1.occurredOn': ['occurredOn is not a real date'],
      'records.1.currency': ["A TWD record can't be posted to a JPY account (ADR 0016)."],
      'records.1.lines.0.amount': ['Amounts must be positive; the record type sets the direction.'],
      'records.1.lines.0.budgetItemId': ["An expense can't use an Income item."],
    });
  });

  it('lists the ids to look up', () => {
    expect(referencedIds([expense(), expense({ accountId: 'yen', lines: [{ amount: '1' }] })])).toEqual({
      accounts: ['cash', 'yen'],
      categories: ['food'],
      budgetItems: ['lunch'],
    });
  });
});

const listed = (fields: Partial<ListedRecord>): ListedRecord => ({
  type: 'expense',
  occurredOn: '2026-10-12',
  occurredAt: null,
  accountId: 'cash',
  counterAccountId: null,
  currency: 'TWD',
  createdAt: '2026-10-12T01:00:00Z',
  lines: [{ fxRate: null, categoryId: null, budgetItemId: null }],
  ...fields,
});

describe('record lists', () => {
  it('filters by date range, type, either account, and any line', () => {
    const transfer = listed({ type: 'transfer', accountId: 'bank', counterAccountId: 'cash' });
    const split = listed({
      lines: [
        { fxRate: null, categoryId: 'food', budgetItemId: null },
        { fxRate: null, categoryId: null, budgetItemId: 'lunch' },
      ],
    });
    const range = { from: '2026-10-01', to: '2026-10-31' };
    expect(matchesRecordFilters(listed({ occurredOn: '2026-11-01' }), range)).toBe(false);
    expect(matchesRecordFilters(transfer, { ...range, accountId: 'cash' })).toBe(true);
    expect(matchesRecordFilters(transfer, { ...range, type: 'expense' })).toBe(false);
    expect(matchesRecordFilters(split, { ...range, categoryId: 'food', budgetItemId: 'lunch' })).toBe(true);
    expect(matchesRecordFilters(split, { ...range, budgetItemId: 'rent' })).toBe(false);
  });

  it('puts the newest first, a record without a time at the end of its day', () => {
    const records = [
      listed({ occurredOn: '2026-10-11', createdAt: 'a' }),
      listed({ occurredAt: '09:00', createdAt: 'b' }),
      listed({ occurredAt: null, createdAt: 'c' }),
      listed({ occurredAt: null, createdAt: 'd' }),
      listed({ occurredAt: '18:30', createdAt: 'e' }),
    ];
    expect([...records].sort(compareRecordsNewestFirst).map((r) => r.createdAt)).toEqual(['d', 'c', 'e', 'b', 'a']);
  });

  it('finds the last rate used per currency', () => {
    const rate = (currency: Currency, occurredOn: string, fxRate: string) =>
      listed({ currency, occurredOn, lines: [{ fxRate, categoryId: null, budgetItemId: null }] });
    expect(
      lastUsedRates([rate('USD', '2026-10-01', '32.1'), rate('JPY', '2026-10-05', '0.21'), rate('USD', '2026-10-09', '32.5'), listed({})]),
    ).toEqual([
      { currency: 'JPY', rate: '0.21', occurredOn: '2026-10-05' },
      { currency: 'USD', rate: '32.5', occurredOn: '2026-10-09' },
    ]);
  });
});
