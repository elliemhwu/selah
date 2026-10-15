import type { ApiSchemas } from '@selah/api-client';
import type { Currency, IsoWeekday } from '@selah/shared-types';
import Dexie, { type DexieOptions, liveQuery, type Table } from 'dexie';

// What the device keeps (ADR 0025, 0026): every row in the shape the API
// returns, plus `deletedAt` for soft deletes (ADR 0007). Derived values such
// as balances and a plan version's `editable` are calculated, not stored.

type Deletable = { deletedAt: string | null };

export type StoredAccount = Omit<ApiSchemas['AccountDto'], 'balance'> & Deletable;
export type StoredCategory = ApiSchemas['CategoryDto'] & Deletable;
export type StoredRecord = ApiSchemas['RecordDto'] & Deletable;
export type StoredPlanVersion = Omit<ApiSchemas['PlanVersionDto'], 'editable'> & Deletable;
export type StoredBudgetTransfer = ApiSchemas['BudgetTransferDto'] & Deletable;

/** The single settings row (ADR 0024). */
export interface StoredSettings {
  id: 'settings';
  weekStartDay: IsoWeekday;
  defaultCurrency: Currency;
  updatedAt: string;
}

/** Everything on the device, deleted rows included. */
export interface DeviceSnapshot {
  accounts: StoredAccount[];
  categories: StoredCategory[];
  records: StoredRecord[];
  planVersions: StoredPlanVersion[];
  budgetTransfers: StoredBudgetTransfer[];
  /** Null until the settings are first saved. */
  settings: StoredSettings | null;
}

/** Rows to create or replace, by table; saved together or not at all. */
export type DeviceChanges = Partial<Omit<DeviceSnapshot, 'settings'>> & { settings?: StoredSettings };

export const EMPTY_SNAPSHOT: DeviceSnapshot = {
  accounts: [],
  categories: [],
  records: [],
  planVersions: [],
  budgetTransfers: [],
  settings: null,
};

const TABLES = ['accounts', 'categories', 'records', 'planVersions', 'budgetTransfers'] as const;

/** A table whose rows sync with the server (ADR 0028). */
export type SyncedTable = (typeof TABLES)[number] | 'settings';

/** A row saved on this device and not yet accepted by the server (ADR 0028). */
export interface OutboxEntry {
  /** `table:id`. */
  key: string;
  table: SyncedTable;
  id: string;
  /** Goes up with every local save of the row, so a push only clears the save it sent. */
  rev: number;
  /** `attention` when the server refused the change; it waits for the user. */
  state: 'pending' | 'attention';
  /** The server's reason, for an entry needing attention. */
  message: string | null;
}

/** A push's outcome for entries as they were sent (`rev` included). */
export interface OutboxSettlement {
  /** Accepted by the server: removed, unless the row was saved again meanwhile. */
  done: Pick<OutboxEntry, 'key' | 'rev'>[];
  /** Refused by the server: they need attention, unless the row was saved again meanwhile. */
  refused: (Pick<OutboxEntry, 'key' | 'rev'> & { message: string })[];
}

/** This device's connection to a sync server; never synced or backed up (ADR 0028). */
export interface SyncConnection {
  id: 'sync';
  /** The server's address, such as `https://selah.example.com`, without a trailing slash. */
  server: string;
  token: string;
  /** From the last pull; null pulls everything. */
  cursor: string | null;
  lastSyncedAt: string | null;
}

export const outboxKey = (table: SyncedTable, id: string) => `${table}:${id}`;

/** Where the device keeps its data: IndexedDB in the app, memory in tests. */
export interface DeviceStorage {
  load(): Promise<DeviceSnapshot>;
  /** Saves changes made on this device and queues them for sync, together. */
  save(changes: DeviceChanges): Promise<void>;
  /** Saves rows from the server, except those still in the outbox; returns what it saved. */
  saveFromServer(changes: DeviceChanges): Promise<DeviceChanges>;
  /** Replaces everything with `snapshot`, as one transaction (restoring a backup). */
  replace(snapshot: DeviceSnapshot): Promise<void>;
  /** Reports changes made elsewhere, such as another tab. Returns a function that stops watching. */
  watch(onChange: (snapshot: DeviceSnapshot) => void): () => void;

  outbox(): Promise<OutboxEntry[]>;
  settleOutbox(settlement: OutboxSettlement): Promise<void>;
  /** Puts entries back in the queue, or every row on the device when `keys` is omitted. */
  requeue(keys?: string[]): Promise<void>;
  /** Removes entries, or the whole outbox when `keys` is omitted. */
  dropFromOutbox(keys?: string[]): Promise<void>;
  connection(): Promise<SyncConnection | null>;
  setConnection(connection: SyncConnection | null): Promise<void>;
}

/** IndexedDB through Dexie (ADR 0026). */
export class DexieStorage implements DeviceStorage {
  private readonly db: SelahDb;

  /** `options` can supply another IndexedDB, such as fake-indexeddb in tests. */
  constructor(options?: DexieOptions) {
    this.db = new SelahDb(options);
  }

  async load(): Promise<DeviceSnapshot> {
    return this.db.transaction('r', [...TABLES.map((t) => this.db[t]), this.db.settings], () => this.read());
  }

  async save(changes: DeviceChanges): Promise<void> {
    await this.db.transaction('rw', [...this.dataTables(), this.db.outbox], async () => {
      await this.write(changes);
      const keys = changedKeys(changes);
      const existing = await this.db.outbox.bulkGet(keys.map(([key]) => key));
      await this.db.outbox.bulkPut(keys.map(([key, table, id], i) => queued(key, table, id, existing[i])));
    });
  }

  async saveFromServer(changes: DeviceChanges): Promise<DeviceChanges> {
    return this.db.transaction('rw', [...this.dataTables(), this.db.outbox], async () => {
      const queuedKeys = new Set((await this.db.outbox.toCollection().primaryKeys()) as string[]);
      const applied = withoutKeys(changes, queuedKeys);
      await this.write(applied);
      return applied;
    });
  }

  async replace(snapshot: DeviceSnapshot): Promise<void> {
    await this.db.transaction('rw', [...TABLES.map((t) => this.db[t]), this.db.settings], async () => {
      for (const table of TABLES) {
        await this.db[table].clear();
        await (this.db[table] as Table<unknown, string>).bulkPut(snapshot[table]);
      }
      await this.db.settings.clear();
      if (snapshot.settings) await this.db.settings.put(snapshot.settings);
    });
  }

  watch(onChange: (snapshot: DeviceSnapshot) => void): () => void {
    // A live query runs again whenever any of its tables changes, in any tab.
    const subscription = liveQuery(() => this.read()).subscribe({ next: onChange, error: () => undefined });
    return () => subscription.unsubscribe();
  }

  outbox(): Promise<OutboxEntry[]> {
    return this.db.outbox.toArray();
  }

  async settleOutbox({ done, refused }: OutboxSettlement): Promise<void> {
    await this.db.transaction('rw', this.db.outbox, async () => {
      const current = await this.db.outbox.bulkGet([...done, ...refused].map((e) => e.key));
      const byKey = new Map(current.filter((e) => !!e).map((e) => [e.key, e]));
      await this.db.outbox.bulkDelete(done.filter((e) => byKey.get(e.key)?.rev === e.rev).map((e) => e.key));
      const attention = refused.flatMap((e) => {
        const entry = byKey.get(e.key);
        return entry?.rev === e.rev ? [{ ...entry, state: 'attention' as const, message: e.message }] : [];
      });
      await this.db.outbox.bulkPut(attention);
    });
  }

  async requeue(keys?: string[]): Promise<void> {
    await this.db.transaction('rw', [...this.dataTables(), this.db.outbox], async () => {
      const wanted = keys ? new Set(keys) : null;
      const all = changedKeys(await this.read()).filter(([key]) => !wanted || wanted.has(key));
      const existing = await this.db.outbox.bulkGet(all.map(([key]) => key));
      await this.db.outbox.bulkPut(all.map(([key, table, id], i) => queued(key, table, id, existing[i])));
    });
  }

  async dropFromOutbox(keys?: string[]): Promise<void> {
    if (keys) await this.db.outbox.bulkDelete(keys);
    else await this.db.outbox.clear();
  }

  async connection(): Promise<SyncConnection | null> {
    return (await this.db.sync.get('sync')) ?? null;
  }

  async setConnection(connection: SyncConnection | null): Promise<void> {
    if (connection) await this.db.sync.put(connection);
    else await this.db.sync.clear();
  }

  private dataTables() {
    return [...TABLES.map((t) => this.db[t]), this.db.settings];
  }

  private async write(changes: DeviceChanges): Promise<void> {
    for (const table of TABLES) {
      const rows = changes[table];
      if (rows?.length) await (this.db[table] as Table<unknown, string>).bulkPut(rows);
    }
    if (changes.settings) await this.db.settings.put(changes.settings);
  }

  private async read(): Promise<DeviceSnapshot> {
    const [accounts, categories, records, planVersions, budgetTransfers, settings] = await Promise.all([
      this.db.accounts.toArray(),
      this.db.categories.toArray(),
      this.db.records.toArray(),
      this.db.planVersions.toArray(),
      this.db.budgetTransfers.toArray(),
      this.db.settings.get('settings'),
    ]);
    return { accounts, categories, records, planVersions, budgetTransfers, settings: settings ?? null };
  }
}

class SelahDb extends Dexie {
  accounts!: Table<StoredAccount, string>;
  categories!: Table<StoredCategory, string>;
  records!: Table<StoredRecord, string>;
  planVersions!: Table<StoredPlanVersion, string>;
  budgetTransfers!: Table<StoredBudgetTransfer, string>;
  settings!: Table<StoredSettings, string>;
  outbox!: Table<OutboxEntry, string>;
  sync!: Table<SyncConnection, string>;

  constructor(options?: DexieOptions) {
    super('selah', options);
    // Every table is keyed by its UUID (ADR 0007). Add a version with an upgrade function to change this.
    this.version(1).stores({
      accounts: 'id',
      categories: 'id',
      records: 'id, occurredOn',
      planVersions: 'id',
      budgetTransfers: 'id, occurredOn',
      settings: 'id',
    });
    // Sync (ADR 0028): what waits to be pushed, and this device's connection.
    this.version(2).stores({ outbox: 'key', sync: 'id' });
  }
}

/** Keeps everything in memory; for tests. */
export class MemoryStorage implements DeviceStorage {
  private data: DeviceSnapshot;
  private readonly entries = new Map<string, OutboxEntry>();
  private sync: SyncConnection | null = null;

  constructor(seed: Partial<DeviceSnapshot> = {}) {
    this.data = structuredClone({ ...EMPTY_SNAPSHOT, ...seed });
  }

  /** What has been saved so far. */
  snapshot(): DeviceSnapshot {
    return structuredClone(this.data);
  }

  async load(): Promise<DeviceSnapshot> {
    return this.snapshot();
  }

  async save(changes: DeviceChanges): Promise<void> {
    this.data = applyChanges(this.data, structuredClone(changes));
    for (const [key, table, id] of changedKeys(changes)) this.entries.set(key, queued(key, table, id, this.entries.get(key)));
  }

  async saveFromServer(changes: DeviceChanges): Promise<DeviceChanges> {
    const applied = withoutKeys(structuredClone(changes), new Set(this.entries.keys()));
    this.data = applyChanges(this.data, applied);
    return structuredClone(applied);
  }

  async outbox(): Promise<OutboxEntry[]> {
    return structuredClone([...this.entries.values()]);
  }

  async settleOutbox({ done, refused }: OutboxSettlement): Promise<void> {
    for (const e of done) if (this.entries.get(e.key)?.rev === e.rev) this.entries.delete(e.key);
    for (const e of refused) {
      const entry = this.entries.get(e.key);
      if (entry?.rev === e.rev) this.entries.set(e.key, { ...entry, state: 'attention', message: e.message });
    }
  }

  async requeue(keys?: string[]): Promise<void> {
    const wanted = keys ? new Set(keys) : null;
    for (const [key, table, id] of changedKeys(this.data)) {
      if (!wanted || wanted.has(key)) this.entries.set(key, queued(key, table, id, this.entries.get(key)));
    }
  }

  async dropFromOutbox(keys?: string[]): Promise<void> {
    if (!keys) this.entries.clear();
    for (const key of keys ?? []) this.entries.delete(key);
  }

  async connection(): Promise<SyncConnection | null> {
    return structuredClone(this.sync);
  }

  async setConnection(connection: SyncConnection | null): Promise<void> {
    this.sync = structuredClone(connection);
  }

  async replace(snapshot: DeviceSnapshot): Promise<void> {
    this.data = structuredClone(snapshot);
  }

  watch(): () => void {
    return () => undefined;
  }
}

/** The snapshot with the changed rows replaced or added. */
export function applyChanges(snapshot: DeviceSnapshot, changes: DeviceChanges): DeviceSnapshot {
  const next = { ...snapshot };
  for (const table of TABLES) {
    const rows = changes[table] as { id: string }[] | undefined;
    if (!rows?.length) continue;
    const byId = new Map((next[table] as { id: string }[]).map((row) => [row.id, row]));
    for (const row of rows) byId.set(row.id, row);
    (next as Record<string, unknown>)[table] = [...byId.values()];
  }
  if (changes.settings) next.settings = changes.settings;
  return next;
}

/** The outbox key, table and id of every row in `changes`. */
function changedKeys(changes: DeviceChanges | DeviceSnapshot): [key: string, table: SyncedTable, id: string][] {
  const keys: [string, SyncedTable, string][] = [];
  for (const table of TABLES) {
    for (const row of (changes[table] ?? []) as { id: string }[]) keys.push([outboxKey(table, row.id), table, row.id]);
  }
  if (changes.settings) keys.push([outboxKey('settings', changes.settings.id), 'settings', changes.settings.id]);
  return keys;
}

/** A pending entry for a row just saved, replacing any earlier one. */
function queued(key: string, table: SyncedTable, id: string, existing: OutboxEntry | undefined): OutboxEntry {
  return { key, table, id, rev: (existing?.rev ?? 0) + 1, state: 'pending', message: null };
}

/** `changes` without the rows whose outbox keys are in `skip`. */
function withoutKeys(changes: DeviceChanges, skip: ReadonlySet<string>): DeviceChanges {
  const result: DeviceChanges = {};
  for (const table of TABLES) {
    const rows = (changes[table] ?? []) as { id: string }[];
    const kept = rows.filter((row) => !skip.has(outboxKey(table, row.id)));
    if (kept.length) (result as Record<string, unknown>)[table] = kept;
  }
  if (changes.settings && !skip.has(outboxKey('settings', changes.settings.id))) result.settings = changes.settings;
  return result;
}
