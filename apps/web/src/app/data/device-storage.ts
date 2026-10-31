import type { ApiSchemas } from '@selah/api-client';
import Dexie, { type DexieOptions, liveQuery, type Table } from 'dexie';

// What the app keeps (ADR 0025, 0026, 0029): every row in the shape of the
// API's row store, deleted ones included (ADR 0007). Derived values such as
// balances and a plan version's `editable` are calculated, not stored.

export type StoredAccount = ApiSchemas['AccountRowDto'];
export type StoredCategory = ApiSchemas['CategoryRowDto'];
export type StoredRecord = ApiSchemas['RecordRowDto'];
export type StoredPlanVersion = ApiSchemas['PlanVersionRowDto'];
export type StoredBudgetTransfer = ApiSchemas['BudgetTransferRowDto'];
/** The single settings row (ADR 0024). */
export type StoredSettings = ApiSchemas['SettingsRowDto'];
export type StoredMoment = ApiSchemas['MomentRowDto'];
export type StoredJournal = ApiSchemas['JournalRowDto'];
export type StoredComment = ApiSchemas['CommentRowDto'];
export type StoredGodNote = ApiSchemas['GodNoteRowDto'];
export type StoredArea = ApiSchemas['AreaRowDto'];
export type StoredProjectGroup = ApiSchemas['ProjectGroupRowDto'];
export type StoredProject = ApiSchemas['ProjectRowDto'];
export type StoredTask = ApiSchemas['TaskRowDto'];
export type StoredTaskRecord = ApiSchemas['TaskRecordRowDto'];
export type StoredSession = ApiSchemas['SessionRowDto'];
export type StoredSessionItem = ApiSchemas['SessionItemRowDto'];
export type StoredChangeLog = ApiSchemas['ChangeLogRowDto'];

/** Everything on the device, deleted rows included. */
export interface DeviceSnapshot {
  accounts: StoredAccount[];
  categories: StoredCategory[];
  records: StoredRecord[];
  planVersions: StoredPlanVersion[];
  budgetTransfers: StoredBudgetTransfer[];
  // Journal (ADR 0030)
  moments: StoredMoment[];
  journals: StoredJournal[];
  comments: StoredComment[];
  godNotes: StoredGodNote[];
  // Planner (ADR 0033)
  areas: StoredArea[];
  projectGroups: StoredProjectGroup[];
  projects: StoredProject[];
  tasks: StoredTask[];
  taskRecords: StoredTaskRecord[];
  sessions: StoredSession[];
  sessionItems: StoredSessionItem[];
  changeLog: StoredChangeLog[];
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
  moments: [],
  journals: [],
  comments: [],
  godNotes: [],
  areas: [],
  projectGroups: [],
  projects: [],
  tasks: [],
  taskRecords: [],
  sessions: [],
  sessionItems: [],
  changeLog: [],
  settings: null,
};

const TABLES = [
  'accounts',
  'categories',
  'records',
  'planVersions',
  'budgetTransfers',
  'moments',
  'journals',
  'comments',
  'godNotes',
  'areas',
  'projectGroups',
  'projects',
  'tasks',
  'taskRecords',
  'sessions',
  'sessionItems',
  'changeLog',
] as const;

/** Where the device keeps its data: IndexedDB in the app, memory in tests. */
export interface DeviceStorage {
  load(): Promise<DeviceSnapshot>;
  save(changes: DeviceChanges): Promise<void>;
  /** Replaces everything with `snapshot`, as one transaction (restoring a backup). */
  replace(snapshot: DeviceSnapshot): Promise<void>;
  /** Reports changes made elsewhere, such as another tab. Returns a function that stops watching. */
  watch(onChange: (snapshot: DeviceSnapshot) => void): () => void;
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
    await this.db.transaction('rw', [...TABLES.map((t) => this.db[t]), this.db.settings], async () => {
      for (const table of TABLES) {
        const rows = changes[table];
        if (rows?.length) await (this.db[table] as Table<unknown, string>).bulkPut(rows);
      }
      if (changes.settings) await this.db.settings.put(changes.settings);
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

  private async read(): Promise<DeviceSnapshot> {
    const [rows, settings] = await Promise.all([
      Promise.all(TABLES.map((table) => (this.db[table] as Table<unknown, string>).toArray())),
      this.db.settings.get('settings'),
    ]);
    const tables = Object.fromEntries(TABLES.map((table, i) => [table, rows[i]]));
    return { ...tables, settings: settings ?? null } as DeviceSnapshot;
  }
}

class SelahDb extends Dexie {
  accounts!: Table<StoredAccount, string>;
  categories!: Table<StoredCategory, string>;
  records!: Table<StoredRecord, string>;
  planVersions!: Table<StoredPlanVersion, string>;
  budgetTransfers!: Table<StoredBudgetTransfer, string>;
  settings!: Table<StoredSettings, string>;
  moments!: Table<StoredMoment, string>;
  journals!: Table<StoredJournal, string>;
  comments!: Table<StoredComment, string>;
  godNotes!: Table<StoredGodNote, string>;
  areas!: Table<StoredArea, string>;
  projectGroups!: Table<StoredProjectGroup, string>;
  projects!: Table<StoredProject, string>;
  tasks!: Table<StoredTask, string>;
  taskRecords!: Table<StoredTaskRecord, string>;
  sessions!: Table<StoredSession, string>;
  sessionItems!: Table<StoredSessionItem, string>;
  changeLog!: Table<StoredChangeLog, string>;

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
    // The Journal module's tables (ADR 0030). Adding tables needs no upgrade function.
    this.version(2).stores({
      moments: 'id',
      journals: 'id',
      comments: 'id',
      godNotes: 'id',
    });
    // The Planner module's tables (ADR 0033).
    this.version(3).stores({
      areas: 'id',
      projectGroups: 'id',
      projects: 'id',
      tasks: 'id',
      taskRecords: 'id',
      sessions: 'id',
      sessionItems: 'id',
      changeLog: 'id',
    });
  }
}

/** Keeps everything in memory; for tests. */
export class MemoryStorage implements DeviceStorage {
  private data: DeviceSnapshot;

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
