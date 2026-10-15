import { type DeviceSnapshot, EMPTY_SNAPSHOT, type OutboxEntry, outboxKey, type SyncedTable } from './device-storage';
import { pulledChanges, pushRequests, RECORD_BATCH_SIZE, upsertBody } from './sync-requests';
import { planItem, storedAccount, storedCategory, storedLine, storedRecord, storedTransfer, storedVersion } from './testing';

const entry = (table: SyncedTable, id: string, fields: Partial<OutboxEntry> = {}): OutboxEntry => ({
  key: outboxKey(table, id),
  table,
  id,
  rev: 1,
  state: 'pending',
  message: null,
  ...fields,
});

const DELETED = '2026-10-10T00:00:00.000Z';

describe('pushRequests', () => {
  it('sends what a row refers to first, and deletes last in the opposite order', () => {
    const data: DeviceSnapshot = {
      ...EMPTY_SNAPSHOT,
      accounts: [storedAccount('cash'), storedAccount('old', 'TWD', { deletedAt: DELETED })],
      categories: [storedCategory('lunch', 'food'), storedCategory('food'), storedCategory('gone', null, { deletedAt: DELETED }), storedCategory('gone-child', 'gone', { deletedAt: DELETED })],
      planVersions: [storedVersion('v2', '2026-11', []), storedVersion('v1', '2026-10', [])],
      records: [storedRecord('r1'), storedRecord('r-old', { deletedAt: DELETED })],
      budgetTransfers: [storedTransfer('t1')],
      settings: { id: 'settings', weekStartDay: 7, defaultCurrency: 'JPY', updatedAt: 'x' },
    };
    const entries = [
      entry('budgetTransfers', 't1'),
      entry('records', 'r-old'),
      entry('records', 'r1'),
      entry('categories', 'gone'),
      entry('categories', 'lunch'),
      entry('planVersions', 'v2'),
      entry('accounts', 'old'),
      entry('categories', 'gone-child'),
      entry('categories', 'food'),
      entry('planVersions', 'v1'),
      entry('accounts', 'cash'),
      entry('settings', 'settings'),
    ];
    const { requests, orphans } = pushRequests(entries, data);
    expect(orphans).toEqual([]);
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'PUT core/settings',
      'PUT finance/accounts/cash',
      'PUT finance/categories/food',
      'PUT finance/categories/lunch',
      'PUT finance/plan-versions/v1',
      'PUT finance/plan-versions/v2',
      'PUT finance/records/r1',
      'PUT finance/budget-transfers/t1',
      'DELETE finance/records/r-old',
      'DELETE finance/categories/gone-child',
      'DELETE finance/categories/gone',
      'DELETE finance/accounts/old',
    ]);
  });

  it('skips entries that need attention and reports rows that no longer exist', () => {
    const data = { ...EMPTY_SNAPSHOT, accounts: [storedAccount('cash')] };
    const missing = entry('records', 'nowhere');
    const { requests, orphans } = pushRequests([entry('accounts', 'cash', { state: 'attention' }), missing], data);
    expect(requests).toEqual([]);
    expect(orphans).toEqual([missing]);
  });

  it('sends records in batches, each able to split into single requests', () => {
    const count = RECORD_BATCH_SIZE + 2;
    const records = Array.from({ length: count }, (_, i) => storedRecord(`r${i}`));
    const { requests } = pushRequests(
      records.map((r) => entry('records', r.id)),
      { ...EMPTY_SNAPSHOT, records },
    );
    expect(requests.map((r) => [r.path, r.entries.length])).toEqual([
      ['finance/records', RECORD_BATCH_SIZE],
      ['finance/records', 2],
    ]);
    expect((requests[0].body as { records: { id: string }[] }).records[0].id).toBe('r0');
    expect(requests[1].single?.map((s) => s.path)).toEqual([`finance/records/r${count - 2}`, `finance/records/r${count - 1}`]);
  });
});

describe('upsertBody', () => {
  it('sends a record as the upsert DTO, without the rate on TWD lines', () => {
    const record = storedRecord('r1', {
      currency: 'JPY',
      note: 'Ramen',
      lines: [storedLine('l1', '1200', { twdAmount: '260.00', fxRate: '0.2170' }), storedLine('l2', '0', { fxRate: null })],
    });
    expect(upsertBody('records', record)).toEqual({
      type: 'expense',
      occurredOn: '2026-10-05',
      occurredAt: null,
      accountId: 'cash',
      currency: 'JPY',
      counterAccountId: null,
      counterAmount: null,
      targetBalance: null,
      note: 'Ramen',
      lines: [
        { id: 'l1', amount: '1200', twdAmount: '260.00', fxRate: '0.2170', categoryId: null, budgetItemId: null, note: null },
        { id: 'l2', amount: '0', twdAmount: '0', categoryId: null, budgetItemId: null, note: null },
      ],
    });
  });

  it('leaves out ids, timestamps and deletion for the other tables', () => {
    expect(upsertBody('accounts', storedAccount('cash'))).toEqual({
      name: 'cash',
      type: 'cash',
      currency: 'TWD',
      openingBalance: '0.00',
      sortOrder: 0,
    });
    expect(upsertBody('categories', storedCategory('lunch', 'food'))).toEqual({ name: 'lunch', parentId: 'food', sortOrder: 0 });
    const item = planItem('rent');
    expect(upsertBody('planVersions', storedVersion('v1', '2026-10', [item], { note: 'n' }))).toEqual({
      effectiveFromMonth: '2026-10',
      note: 'n',
      items: [item],
    });
    expect(upsertBody('budgetTransfers', storedTransfer('t1'))).toEqual({
      occurredOn: '2026-10-08',
      occurredAt: null,
      fromItemId: 'rent',
      toItemId: 'allowance',
      amount: '300.00',
      note: null,
    });
    expect(upsertBody('settings', { id: 'settings', weekStartDay: 7, defaultCurrency: 'JPY', updatedAt: 'x' })).toEqual({
      weekStartDay: 7,
      defaultCurrency: 'JPY',
    });
  });
});

describe('pulledChanges', () => {
  it('keeps the rows as they come and gives the settings their device id', () => {
    const account = storedAccount('cash');
    const changes = pulledChanges({
      cursor: 'c',
      accounts: [account],
      categories: [],
      records: [],
      planVersions: [],
      budgetTransfers: [],
      settings: { weekStartDay: 3, defaultCurrency: 'TWD', updatedAt: 'u' },
    });
    expect(changes.accounts).toEqual([account]);
    expect(changes.settings).toEqual({ id: 'settings', weekStartDay: 3, defaultCurrency: 'TWD', updatedAt: 'u' });
    expect(pulledChanges({ cursor: 'c', accounts: [], categories: [], records: [], planVersions: [], budgetTransfers: [], settings: null }).settings).toBeUndefined();
  });
});
