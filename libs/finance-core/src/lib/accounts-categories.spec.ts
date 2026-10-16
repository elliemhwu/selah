import { assertAccountDeletable, balanceOf, prepareAccount, toBalanceRecord } from './accounts';
import { assertCategoryDeletable, prepareCategory, type StoredCategoryRef } from './categories';
import { ConflictError, RuleViolationError } from './errors';

describe('prepareAccount', () => {
  const input = { name: ' Wallet ', type: 'cash' as const, currency: 'JPY' as const, openingBalance: '1000' };

  it('normalises a new account', () => {
    expect(prepareAccount('a1', input, { hasRecords: false })).toEqual({
      name: 'Wallet',
      type: 'cash',
      currency: 'JPY',
      openingBalance: '1000.00',
      sortOrder: 0,
    });
  });

  it('keeps JPY whole and the currency fixed once there are records', () => {
    expect(() => prepareAccount('a1', { ...input, openingBalance: '10.5' }, { hasRecords: false })).toThrow(RuleViolationError);
    const existing = { currency: 'TWD' as const, deletedAt: null };
    expect(() => prepareAccount('a1', input, { existing, hasRecords: true })).toThrow(
      "The currency can't change once the account has records.",
    );
    expect(prepareAccount('a1', input, { existing, hasRecords: false }).currency).toBe('JPY');
  });

  it('refuses a deleted account and deleting one in use', () => {
    expect(() => prepareAccount('a1', input, { existing: { currency: 'JPY', deletedAt: 'x' }, hasRecords: false })).toThrow(
      ConflictError,
    );
    expect(() => assertAccountDeletable(true)).toThrow(ConflictError);
    expect(() => assertAccountDeletable(false)).not.toThrow();
  });
});

describe('balances', () => {
  it('derives a balance from stored records (ADR 0011)', () => {
    const records = [
      { id: 'r1', type: 'income' as const, lines: [{ amount: '500.00', twdAmount: '500.00' }] },
      { id: 'r2', type: 'expense' as const, lines: [{ amount: '120.00', twdAmount: '120.00' }] },
    ].map((r, i) =>
      toBalanceRecord({
        ...r,
        occurredOn: `2026-10-0${i + 1}`,
        occurredAt: null,
        createdAt: '2026-10-01T00:00:00Z',
        accountId: 'cash',
        currency: 'TWD',
        counterAccountId: null,
        counterAmount: null,
        targetBalance: null,
      }),
    );
    expect(balanceOf({ id: 'cash', currency: 'TWD', openingBalance: '100.00' }, records)).toBe('480.00');
  });
});

describe('prepareCategory', () => {
  const tree = new Map<string, StoredCategoryRef>([
    ['food', { parentId: null, deletedAt: null }],
    ['lunch', { parentId: 'food', deletedAt: null }],
    ['gone', { parentId: null, deletedAt: 'x' }],
  ]);
  const find = (id: string) => tree.get(id);

  it('normalises a subcategory', () => {
    expect(prepareCategory('snacks', { name: ' Snacks ', parentId: 'food' }, find)).toEqual({
      name: 'Snacks',
      parentId: 'food',
      sortOrder: 0,
    });
  });

  it('refuses a loop, a missing or deleted parent, and a deleted category', () => {
    expect(() => prepareCategory('food', { name: 'Food', parentId: 'lunch' }, find)).toThrow(
      "A category can't be moved under itself or one of its subcategories.",
    );
    expect(() => prepareCategory('x', { name: 'X', parentId: 'nope' }, find)).toThrow('The parent category does not exist.');
    expect(() => prepareCategory('x', { name: 'X', parentId: 'gone' }, find)).toThrow('The parent category does not exist.');
    expect(() => prepareCategory('gone', { name: 'Gone' }, find)).toThrow(ConflictError);
  });

  it('refuses to delete a category with subcategories', () => {
    expect(() => assertCategoryDeletable(true)).toThrow(ConflictError);
  });
});
