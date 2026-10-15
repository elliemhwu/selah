import { TestBed } from '@angular/core/testing';
import { NotFoundError } from '@selah/finance-core';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { deviceResource, IDLE } from './device-resource';
import { applyChanges, type DeviceStorage, DexieStorage, EMPTY_SNAPSHOT, MemoryStorage } from './device-storage';
import { DEVICE_STORAGE, DeviceStore } from './device-store';
import { storedAccount, storedRecord } from './testing';

describe('DexieStorage', () => {
  it('keeps rows and settings in IndexedDB across instances', async () => {
    const indexedDB = new IDBFactory();
    const first = new DexieStorage({ indexedDB, IDBKeyRange });
    await first.save({
      accounts: [storedAccount('cash')],
      records: [storedRecord('r1')],
      settings: { id: 'settings', weekStartDay: 7, defaultCurrency: 'JPY', updatedAt: 'x' },
    });
    await first.save({ accounts: [storedAccount('cash', 'TWD', { name: 'Wallet' })] });

    const reopened = await new DexieStorage({ indexedDB, IDBKeyRange }).load();
    expect(reopened.accounts.map((a) => a.name)).toEqual(['Wallet']);
    expect(reopened.records.map((r) => r.id)).toEqual(['r1']);
    expect(reopened.settings).toMatchObject({ weekStartDay: 7, defaultCurrency: 'JPY' });
    expect(reopened.planVersions).toEqual([]);
  });
});

describe.each([
  ['DexieStorage', () => new DexieStorage({ indexedDB: new IDBFactory(), IDBKeyRange })],
  ['MemoryStorage', () => new MemoryStorage()],
] as [string, () => DeviceStorage][])('%s outbox (ADR 0028)', (_, create) => {
  const keys = async (storage: DeviceStorage) => (await storage.outbox()).map((e) => [e.key, e.rev, e.state]).sort();

  it('queues every local save, once per row', async () => {
    const storage = create();
    await storage.save({ accounts: [storedAccount('cash')], settings: { id: 'settings', weekStartDay: 1, defaultCurrency: 'TWD', updatedAt: 'x' } });
    await storage.save({ accounts: [storedAccount('cash', 'TWD', { name: 'Wallet' })] });
    expect(await keys(storage)).toEqual([
      ['accounts:cash', 2, 'pending'],
      ['settings:settings', 1, 'pending'],
    ]);
  });

  it("saves the server's rows without queueing them, except rows still waiting to be pushed", async () => {
    const storage = create();
    await storage.save({ accounts: [storedAccount('cash', 'TWD', { name: 'Mine' })] });
    const applied = await storage.saveFromServer({
      accounts: [storedAccount('cash', 'TWD', { name: 'Theirs' }), storedAccount('bank')],
    });
    expect(applied.accounts?.map((a) => a.id)).toEqual(['bank']);
    expect((await storage.load()).accounts.map((a) => a.name).sort()).toEqual(['Mine', 'bank']);
    expect(await keys(storage)).toEqual([['accounts:cash', 1, 'pending']]);
  });

  it('settles only the save it sent: a row saved again stays queued', async () => {
    const storage = create();
    await storage.save({ accounts: [storedAccount('a'), storedAccount('b'), storedAccount('c')] });
    const sent = await storage.outbox();
    await storage.save({ accounts: [storedAccount('b', 'JPY')] });
    const rev = (key: string) => sent.find((e) => e.key === key)?.rev ?? 0;
    await storage.settleOutbox({
      done: [{ key: 'accounts:a', rev: rev('accounts:a') }, { key: 'accounts:b', rev: rev('accounts:b') }],
      refused: [{ key: 'accounts:c', rev: rev('accounts:c'), message: 'No.' }],
    });
    expect(await keys(storage)).toEqual([
      ['accounts:b', 2, 'pending'],
      ['accounts:c', 1, 'attention'],
    ]);
    expect((await storage.outbox()).find((e) => e.key === 'accounts:c')?.message).toBe('No.');
  });

  it('requeues one entry or every row, and drops entries', async () => {
    const storage = create();
    await storage.saveFromServer({ accounts: [storedAccount('a')], records: [storedRecord('r1')] });
    expect(await storage.outbox()).toEqual([]);
    await storage.requeue(['accounts:a']);
    expect(await keys(storage)).toEqual([['accounts:a', 1, 'pending']]);
    await storage.requeue();
    expect(await keys(storage)).toEqual([
      ['accounts:a', 2, 'pending'],
      ['records:r1', 1, 'pending'],
    ]);
    await storage.dropFromOutbox(['records:r1']);
    expect(await keys(storage)).toEqual([['accounts:a', 2, 'pending']]);
    await storage.dropFromOutbox();
    expect(await storage.outbox()).toEqual([]);
  });

  it('keeps the connection apart from the data', async () => {
    const storage = create();
    expect(await storage.connection()).toBeNull();
    const connection = { id: 'sync' as const, server: 'https://s', token: 't', cursor: null, lastSyncedAt: null };
    await storage.setConnection(connection);
    expect(await storage.connection()).toEqual(connection);
    expect(await storage.load()).toEqual(EMPTY_SNAPSHOT);
    await storage.setConnection(null);
    expect(await storage.connection()).toBeNull();
  });
});

describe('applyChanges', () => {
  it('replaces rows by id and adds new ones', () => {
    const before = { ...EMPTY_SNAPSHOT, accounts: [storedAccount('a'), storedAccount('b')] };
    const after = applyChanges(before, { accounts: [storedAccount('b', 'JPY'), storedAccount('c')] });
    expect(after.accounts.map((a) => [a.id, a.currency])).toEqual([
      ['a', 'TWD'],
      ['b', 'JPY'],
      ['c', 'TWD'],
    ]);
    expect(before.accounts).toHaveLength(2);
  });
});

describe('DeviceStore and deviceResource', () => {
  function setup(storage = new MemoryStorage({ accounts: [storedAccount('cash')] })) {
    TestBed.configureTestingModule({ providers: [{ provide: DEVICE_STORAGE, useValue: storage }] });
    return TestBed.inject(DeviceStore);
  }

  it('loads, then follows saves', async () => {
    const store = setup();
    const names = TestBed.runInInjectionContext(() =>
      deviceResource(store, () => store.data().accounts.map((a) => a.name), { defaultValue: [] as string[] }),
    );
    expect(names.status()).toBe('loading');
    expect(names.hasValue()).toBe(true); // the default counts, like Angular's resources
    await store.whenLoaded();
    expect(names.status()).toBe('resolved');
    expect(names.value()).toEqual(['cash']);

    await store.save({ accounts: [storedAccount('bank')] });
    expect(names.value()).toEqual(['cash', 'bank']);
  });

  it('is idle until there is something to ask for, and in error when the calculation throws', async () => {
    const store = setup();
    await store.whenLoaded();
    const lookup = (id: string | undefined) =>
      deviceResource(store, () => {
        if (!id) return IDLE;
        throw new NotFoundError(`Account ${id} not found.`);
      });

    const nothingAsked = lookup(undefined);
    expect(nothingAsked.status()).toBe('idle');
    expect(nothingAsked.hasValue()).toBe(false);

    const unknown = lookup('gone');
    expect(unknown.status()).toBe('error');
    expect(unknown.error()).toBeInstanceOf(NotFoundError);
    expect(() => unknown.value()).toThrow(NotFoundError);
  });

  it('reports storage that fails to open, and can try again', async () => {
    let fail = true;
    const storage = new MemoryStorage();
    const load = storage.load.bind(storage);
    storage.load = () => (fail ? Promise.reject(new Error('blocked')) : load());
    const store = setup(storage);
    await store.whenLoaded();
    expect(store.status()).toBe('error');
    fail = false;
    await store.reload();
    expect(store.status()).toBe('ready');
  });
});
