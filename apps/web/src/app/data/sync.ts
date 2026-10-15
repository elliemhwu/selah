import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type { ApiSchemas } from '@selah/api-client';
import { DEVICE_STORAGE, DeviceStore } from './device-store';
import type { OutboxEntry, OutboxSettlement, SyncConnection } from './device-storage';
import { pulledChanges, type PushRequest, pushRequests } from './sync-requests';
import { normalizeServer, refusalMessage, SYNC_SERVER, SyncError, type SyncResponse, type SyncServer } from './sync-server';

/** How long after a save to wait before syncing, so a burst of saves goes together. */
export const SYNC_DELAY_MS = 3000;

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error';

/**
 * Keeps this device in step with the sync server (ADR 0028): push the
 * outbox, then pull what changed since the cursor. It runs when the app
 * opens, after saves, when the device is back online or the app is back on
 * screen, and on request.
 */
@Injectable({ providedIn: 'root' })
export class Sync {
  private readonly store = inject(DeviceStore);
  private readonly storage = inject(DEVICE_STORAGE);
  private readonly openServer = inject(SYNC_SERVER);

  private readonly current = signal<SyncConnection | null>(null);
  private readonly entries = signal<OutboxEntry[]>([]);
  private readonly state = signal<SyncStatus>('off');
  private readonly failure = signal<string | null>(null);
  private running: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private started = false;

  /** The server this device syncs with, or null. */
  readonly server = computed(() => this.current()?.server ?? null);
  readonly lastSyncedAt = computed(() => this.current()?.lastSyncedAt ?? null);
  readonly status = this.state.asReadonly();
  /** Why the last sync stopped, if it did. */
  readonly error = this.failure.asReadonly();
  /** Changes waiting to be pushed. */
  readonly pending = computed(() => this.entries().filter((e) => e.state === 'pending').length);
  /** Changes the server refused, waiting for the user. */
  readonly attention = computed(() => this.entries().filter((e) => e.state === 'attention'));

  constructor() {
    // A save queues its rows; sync a moment later.
    effect(() => {
      if (this.store.localSaves() === 0) return;
      untracked(() => {
        void this.refreshOutbox();
        this.schedule();
      });
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  /** Loads the connection and syncs; called once by the app shell. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => void this.syncNow());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void this.syncNow();
      });
    }
    await this.store.whenLoaded();
    // Without the device's data there is nothing to sync; the shell says so.
    if (this.store.status() === 'error') return;
    this.current.set(await this.storage.connection());
    await this.refreshOutbox();
    if (this.current()) await this.syncNow();
  }

  /**
   * Connects this device and syncs everything on it. If the server can't be
   * reached or refuses the token, nothing is kept and the error is thrown.
   */
  async connect(address: string, token: string): Promise<void> {
    const connection: SyncConnection = { id: 'sync', server: normalizeServer(address), token: token.trim(), cursor: null, lastSyncedAt: null };
    // Check first, so a typo doesn't leave a broken connection behind.
    const check = await this.openServer(connection.server, connection.token).send(
      'GET',
      `sync/changes?since=${encodeURIComponent(new Date().toISOString())}`,
    );
    if (check.status !== 200) {
      throw new SyncError('server', $localize`:@@sync.notSelah:That address doesn't answer like a Selah server.`);
    }
    await this.storage.setConnection(connection);
    // Data entered before connecting reaches the server too.
    await this.storage.requeue();
    this.current.set(connection);
    await this.syncNow();
  }

  /** Stops syncing on this device; the data stays. */
  async disconnect(): Promise<void> {
    clearTimeout(this.timer);
    await this.storage.setConnection(null);
    this.current.set(null);
    this.state.set('off');
    this.failure.set(null);
  }

  /** Pushes, then pulls. Waits for a sync already running, then runs once more. */
  async syncNow(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.runExclusive().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        void this.syncNow();
      }
    });
    return this.running;
  }

  /** Puts a refused change back in the queue and syncs. */
  async retry(entry: OutboxEntry): Promise<void> {
    await this.storage.requeue([entry.key]);
    await this.refreshOutbox();
    await this.syncNow();
  }

  /** Drops a refused change and pulls everything again, so the server's copy replaces it. */
  async useServerCopy(entry: OutboxEntry): Promise<void> {
    await this.storage.dropFromOutbox([entry.key]);
    await this.resetCursor();
    await this.refreshOutbox();
    await this.syncNow();
  }

  /** After a backup is restored: its rows replace the server's copies (ADR 0028). */
  async afterRestore(): Promise<void> {
    await this.storage.dropFromOutbox();
    const connected = !!(await this.storage.connection());
    if (connected) {
      await this.storage.requeue();
      await this.resetCursor();
    }
    await this.refreshOutbox();
    if (connected) await this.syncNow();
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.syncNow(), SYNC_DELAY_MS);
  }

  private async resetCursor(): Promise<void> {
    const connection = await this.storage.connection();
    if (!connection) return;
    const next = { ...connection, cursor: null };
    await this.storage.setConnection(next);
    this.current.set(next);
  }

  private async refreshOutbox(): Promise<void> {
    this.entries.set(await this.storage.outbox());
  }

  /** One sync at a time across tabs, where the browser supports it. */
  private async runExclusive(): Promise<void> {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    if (locks) await locks.request('selah-sync', () => this.run());
    else await this.run();
  }

  private async run(): Promise<void> {
    // Kept in storage: another tab may have changed the connection or the cursor.
    const connection = await this.storage.connection();
    this.current.set(connection);
    if (!connection) {
      this.state.set('off');
      return;
    }
    const server = this.openServer(connection.server, connection.token);
    this.state.set('syncing');
    try {
      await this.push(server);
      const response = await server.send('GET', `sync/changes${connection.cursor ? `?since=${encodeURIComponent(connection.cursor)}` : ''}`);
      if (response.status !== 200) throw new SyncError('server', refusalMessage(response));
      const changes = response.body as ApiSchemas['SyncChangesDto'];
      await this.store.saveFromServer(pulledChanges(changes));
      const next = { ...connection, cursor: changes.cursor, lastSyncedAt: new Date().toISOString() };
      await this.storage.setConnection(next);
      this.current.set(next);
      this.failure.set(null);
      this.state.set('idle');
    } catch (error) {
      this.failure.set(
        error instanceof SyncError ? error.message : $localize`:@@sync.failed:Sync stopped unexpectedly. Selah will try again later.`,
      );
      this.state.set('error');
    } finally {
      await this.refreshOutbox();
    }
  }

  /** Sends the outbox in order, settling each entry as the server answers. */
  private async push(server: SyncServer): Promise<void> {
    const { requests, orphans } = pushRequests(await this.storage.outbox(), this.store.data());
    const settlement: OutboxSettlement = { done: [...orphans], refused: [] };
    try {
      for (const request of requests) await this.send(server, request, settlement);
    } finally {
      await this.storage.settleOutbox(settlement);
    }
  }

  private async send(server: SyncServer, request: PushRequest, settlement: OutboxSettlement): Promise<void> {
    const response: SyncResponse = await server.send(request.method, request.path, request.body);
    if (response.status < 300 || (request.method === 'DELETE' && response.status === 404)) {
      settlement.done.push(...request.entries);
    } else if (request.single) {
      // A batch is all or nothing: find the rows at fault one by one.
      for (const single of request.single) await this.send(server, single, settlement);
    } else {
      const message = refusalMessage(response);
      settlement.refused.push(...request.entries.map((e) => ({ key: e.key, rev: e.rev, message })));
    }
  }
}
