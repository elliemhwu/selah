import { TestBed } from '@angular/core/testing';
import { type DeviceSnapshot, MemoryStorage, type SyncConnection } from './device-storage';
import { DEVICE_STORAGE, DeviceStore } from './device-store';
import { Sync, SYNC_DELAY_MS } from './sync';
import { SYNC_SERVER, SyncError } from './sync-server';
import { FakeSyncServer, problem, storedAccount, storedCategory, storedRecord } from './testing';

const CONNECTED: SyncConnection = { id: 'sync', server: 'https://selah.test', token: 't0ken', cursor: null, lastSyncedAt: null };

describe('Sync (ADR 0028)', () => {
  let server: FakeSyncServer;
  let storage: MemoryStorage;

  async function setup(seed: Partial<DeviceSnapshot> = {}, connection: SyncConnection | null = null) {
    server = new FakeSyncServer();
    storage = new MemoryStorage(seed);
    await storage.setConnection(connection);
    TestBed.configureTestingModule({
      providers: [
        { provide: DEVICE_STORAGE, useValue: storage },
        { provide: SYNC_SERVER, useValue: server.factory },
      ],
    });
    const sync = TestBed.inject(Sync);
    const store = TestBed.inject(DeviceStore);
    await store.whenLoaded();
    return { sync, store };
  }

  describe('connecting', () => {
    it('checks the server, then pushes everything already on the device and pulls', async () => {
      const { sync } = await setup({ accounts: [storedAccount('cash')], categories: [storedCategory('food')] });
      await sync.connect(' https://selah.test/ ', ' t0ken ');

      expect(server.opened[0]).toEqual(['https://selah.test', 't0ken']);
      expect(server.pushes()).toEqual(['PUT finance/accounts/cash', 'PUT finance/categories/food']);
      expect(server.log.at(-1)).toBe('GET sync/changes');
      expect(await storage.connection()).toMatchObject({ server: 'https://selah.test', cursor: server.cursor });
      expect(sync.server()).toBe('https://selah.test');
      expect(sync.status()).toBe('idle');
      expect(sync.lastSyncedAt()).not.toBeNull();
      expect(sync.pending()).toBe(0);
    });

    it('keeps nothing when the server refuses the token', async () => {
      const { sync } = await setup();
      server.fail = new SyncError('unauthorized', "The server didn't accept the access token.");
      await expect(sync.connect('https://selah.test', 'wrong')).rejects.toThrow("didn't accept");
      expect(await storage.connection()).toBeNull();
      expect(sync.server()).toBeNull();
    });

    it("keeps nothing when the address doesn't answer like Selah", async () => {
      const { sync } = await setup();
      server.refuse = () => ({ status: 404, body: 'Not here' });
      await expect(sync.connect('https://example.com', 't')).rejects.toThrow("doesn't answer like a Selah server");
      expect(await storage.connection()).toBeNull();
    });

    it('stops syncing on disconnect and keeps the data', async () => {
      const { sync, store } = await setup({ accounts: [storedAccount('cash')] }, CONNECTED);
      await sync.disconnect();
      expect(await storage.connection()).toBeNull();
      expect(sync.status()).toBe('off');
      expect(store.data().accounts).toHaveLength(1);
    });
  });

  describe('pushing', () => {
    it('sends local saves, then forgets them', async () => {
      const { sync, store } = await setup({}, CONNECTED);
      await store.save({ records: [storedRecord('r1')] });
      await sync.syncNow();
      expect(server.pushes()).toEqual(['PUT finance/records/r1']);
      expect(await storage.outbox()).toEqual([]);
    });

    it('sends a deleted row as DELETE, and a 404 counts as done', async () => {
      const { sync, store } = await setup({}, CONNECTED);
      await store.save({ records: [storedRecord('r1', { deletedAt: '2026-10-10T00:00:00Z' })] });
      server.refuse = (method) => (method === 'DELETE' ? problem(404, 'Record r1 not found.') : undefined);
      await sync.syncNow();
      expect(server.pushes()).toEqual(['DELETE finance/records/r1']);
      expect(await storage.outbox()).toEqual([]);
    });

    it('keeps a refused change for the user, and still sends the rest', async () => {
      const { sync, store } = await setup({}, CONNECTED);
      await store.save({ accounts: [storedAccount('cash'), storedAccount('bank')] });
      server.refuse = (method, path) => (path.endsWith('/cash') ? problem(409, 'An account named "cash" already exists.') : undefined);
      await sync.syncNow();

      expect(server.pushes()).toEqual(['PUT finance/accounts/cash', 'PUT finance/accounts/bank']);
      expect(sync.attention()).toEqual([
        expect.objectContaining({ key: 'accounts:cash', message: 'An account named "cash" already exists.' }),
      ]);
      expect(sync.pending()).toBe(0);
      expect(sync.status()).toBe('idle');
    });

    it('finds the record a batch was refused for by sending them one by one', async () => {
      const { sync, store } = await setup({}, CONNECTED);
      await store.save({ records: [storedRecord('r1'), storedRecord('r2'), storedRecord('r3')] });
      server.refuse = (method, path) =>
        path === 'finance/records' || path.endsWith('/r2') ? problem(422, 'The account is unknown.') : undefined;
      await sync.syncNow();

      expect(server.pushes()).toEqual([
        'PUT finance/records',
        'PUT finance/records/r1',
        'PUT finance/records/r2',
        'PUT finance/records/r3',
      ]);
      expect(sync.attention().map((e) => e.key)).toEqual(['records:r2']);
    });

    it('tries a refused change again when asked', async () => {
      const { sync, store } = await setup({}, CONNECTED);
      await store.save({ accounts: [storedAccount('cash')] });
      server.refuse = () => problem(422, 'No.');
      await sync.syncNow();
      expect(sync.attention()).toHaveLength(1);

      server.refuse = () => undefined;
      await sync.retry(sync.attention()[0]);
      expect(sync.attention()).toEqual([]);
      expect(await storage.outbox()).toEqual([]);
    });

    it("drops a refused change and pulls everything again to use the server's copy", async () => {
      const { sync, store } = await setup({}, { ...CONNECTED, cursor: 'old-cursor' });
      await store.save({ accounts: [storedAccount('cash', 'TWD', { name: 'Mine' })] });
      server.refuse = (method) => (method === 'PUT' ? problem(409, 'Account cash was deleted.') : undefined);
      await sync.syncNow();
      expect(store.data().accounts[0].name).toBe('Mine');

      server.changes = { accounts: [storedAccount('cash', 'TWD', { name: 'Theirs', deletedAt: '2026-10-10T00:00:00Z' })] };
      await sync.useServerCopy(sync.attention()[0]);
      expect(server.log.at(-1)).toBe('GET sync/changes');
      expect(store.data().accounts[0]).toMatchObject({ name: 'Theirs', deletedAt: '2026-10-10T00:00:00Z' });
      expect(sync.attention()).toEqual([]);
    });

    it('stops when the server is unreachable and keeps everything queued', async () => {
      const { sync, store } = await setup({}, CONNECTED);
      await store.save({ accounts: [storedAccount('cash')] });
      server.fail = new SyncError('offline', "Can't reach the sync server.");
      await sync.syncNow();
      expect(sync.status()).toBe('error');
      expect(sync.error()).toBe("Can't reach the sync server.");
      expect(sync.pending()).toBe(1);
      expect(await storage.connection()).toMatchObject({ cursor: null, lastSyncedAt: null });
    });

    it('syncs a moment after a save', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        const { store } = await setup({}, CONNECTED);
        await store.save({ accounts: [storedAccount('cash')] });
        TestBed.tick();
        expect(server.log).toEqual([]);
        await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
        expect(server.pushes()).toEqual(['PUT finance/accounts/cash']);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('pulling', () => {
    it('saves what changed on the server and moves the cursor on', async () => {
      const { sync, store } = await setup({}, { ...CONNECTED, cursor: 'c1' });
      server.changes = {
        accounts: [storedAccount('bank')],
        settings: { weekStartDay: 7, defaultCurrency: 'JPY', updatedAt: '2026-10-14T00:00:00Z' },
      };
      await sync.syncNow();
      expect(server.log).toEqual(['GET sync/changes?since=c1']);
      expect(store.data().accounts.map((a) => a.id)).toEqual(['bank']);
      expect(store.data().settings).toMatchObject({ id: 'settings', weekStartDay: 7 });
      expect(await storage.outbox()).toEqual([]);
      expect((await storage.connection())?.cursor).toBe(server.cursor);
    });

    it('keeps a change made here while it was being pushed', async () => {
      const { sync, store } = await setup({}, CONNECTED);
      await store.save({ accounts: [storedAccount('cash', 'TWD', { name: 'Mine' })] });
      // The row changes again on this device before the push is answered.
      server.refuse = (method) => {
        if (method === 'PUT') void store.save({ accounts: [storedAccount('cash', 'TWD', { name: 'Newer' })] });
        return undefined;
      };
      server.changes = { accounts: [storedAccount('cash', 'TWD', { name: 'Mine' })] };
      await sync.syncNow();
      expect(store.data().accounts[0].name).toBe('Newer');
      expect(sync.pending()).toBe(1);
    });
  });

  it('after a restore, sends every restored row and pulls everything again', async () => {
    const { sync, store } = await setup({}, { ...CONNECTED, cursor: 'c1' });
    await store.replace({ ...(await storage.load()), accounts: [storedAccount('cash')] });
    await sync.afterRestore();
    expect(server.log).toEqual(['PUT finance/accounts/cash', 'GET sync/changes']);
  });

  it('does nothing without a connection', async () => {
    const { sync, store } = await setup();
    await store.save({ accounts: [storedAccount('cash')] });
    await sync.syncNow();
    await sync.start();
    expect(server.log).toEqual([]);
    expect(sync.status()).toBe('off');
    expect(sync.pending()).toBe(1);
  });
});
