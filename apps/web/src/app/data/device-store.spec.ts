import { TestBed } from '@angular/core/testing';
import { NotFoundError } from '@selah/shared-utils';
import Dexie from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { deviceResource, IDLE } from './device-resource';
import { applyChanges, DexieStorage, EMPTY_SNAPSHOT, MemoryStorage } from './device-storage';
import { DEVICE_STORAGE, DeviceStore } from './device-store';
import { storedAccount, storedJournal, storedRecord } from './testing';

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

  it('opens a database from before the Journal module, keeping its rows (ADR 0030)', async () => {
    const indexedDB = new IDBFactory();
    const before = new Dexie('selah', { indexedDB, IDBKeyRange });
    before.version(1).stores({
      accounts: 'id',
      categories: 'id',
      records: 'id, occurredOn',
      planVersions: 'id',
      budgetTransfers: 'id, occurredOn',
      settings: 'id',
    });
    await before.table('accounts').put(storedAccount('cash'));
    before.close();

    const storage = new DexieStorage({ indexedDB, IDBKeyRange });
    expect((await storage.load()).accounts.map((a) => a.id)).toEqual(['cash']);
    await storage.save({ journals: [storedJournal('j1')] });
    expect((await storage.load()).journals.map((j) => j.id)).toEqual(['j1']);
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
