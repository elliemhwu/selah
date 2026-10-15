import type { ApiSchemas } from '@selah/api-client';
import type {
  DeviceChanges,
  DeviceSnapshot,
  OutboxEntry,
  StoredAccount,
  StoredBudgetTransfer,
  StoredCategory,
  StoredPlanVersion,
  StoredRecord,
  StoredSettings,
  SyncedTable,
} from './device-storage';

// What a push sends and a pull brings (ADR 0028), as pure functions. A push
// sends each queued row as it is now, through the API's own endpoints, in an
// order where whatever a row refers to reaches the server first.

/** One request of a push, and the outbox entries it settles. */
export interface PushRequest {
  method: 'PUT' | 'DELETE';
  /** Under `/api/v1/`. */
  path: string;
  body?: unknown;
  entries: OutboxEntry[];
  /** For a batch: the same rows one request each, to find the one the server refuses. */
  single?: PushRequest[];
}

export const RECORD_BATCH_SIZE = 50;

/** Creates and updates go in this order; deletes go in the opposite order. */
const TABLE_ORDER: SyncedTable[] = ['settings', 'accounts', 'categories', 'planVersions', 'records', 'budgetTransfers'];

const PATHS: Record<SyncedTable, string> = {
  settings: 'core/settings',
  accounts: 'finance/accounts',
  categories: 'finance/categories',
  planVersions: 'finance/plan-versions',
  records: 'finance/records',
  budgetTransfers: 'finance/budget-transfers',
};

type Row = { id: string; deletedAt?: string | null };

/**
 * The requests that push the pending entries, in order, and the entries
 * whose row no longer exists on the device (nothing to send).
 */
export function pushRequests(
  entries: readonly OutboxEntry[],
  data: DeviceSnapshot,
): { requests: PushRequest[]; orphans: OutboxEntry[] } {
  const rows = rowsByKey(data);
  const upserts: { entry: OutboxEntry; row: Row }[] = [];
  const deletes: { entry: OutboxEntry; row: Row }[] = [];
  const orphans: OutboxEntry[] = [];
  for (const entry of entries) {
    if (entry.state !== 'pending') continue;
    const row = rows.get(entry.key);
    if (!row) orphans.push(entry);
    else (row.deletedAt ? deletes : upserts).push({ entry, row });
  }

  const depth = categoryDepths(data.categories);
  const rank = (table: SyncedTable, row: Row): string | number => {
    if (table === 'categories') return depth.get(row.id) ?? 0;
    if (table === 'planVersions') return (row as StoredPlanVersion).effectiveFromMonth;
    return 0;
  };
  const compare = (a: { entry: OutboxEntry; row: Row }, b: { entry: OutboxEntry; row: Row }) =>
    TABLE_ORDER.indexOf(a.entry.table) - TABLE_ORDER.indexOf(b.entry.table) ||
    compareRank(rank(a.entry.table, a.row), rank(b.entry.table, b.row));
  upserts.sort(compare);
  // Children before parents, newest versions first, records before their accounts.
  deletes.sort((a, b) => compare(b, a));

  const requests: PushRequest[] = [];
  let batch: PushRequest[] = [];
  const flush = () => {
    if (batch.length === 1) requests.push(batch[0]);
    else if (batch.length > 1) requests.push(recordBatch(batch));
    batch = [];
  };
  for (const { entry, row } of upserts) {
    const request = upsertRequest(entry, row);
    if (entry.table !== 'records') {
      flush();
      requests.push(request);
      continue;
    }
    batch.push(request);
    if (batch.length === RECORD_BATCH_SIZE) flush();
  }
  flush();
  for (const { entry } of deletes) {
    requests.push({ method: 'DELETE', path: `${PATHS[entry.table]}/${entry.id}`, entries: [entry] });
  }
  return { requests, orphans };
}

function compareRank(a: string | number, b: string | number): number {
  return typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
}

function recordBatch(single: PushRequest[]): PushRequest {
  return {
    method: 'PUT',
    path: PATHS.records,
    body: { records: single.map((r) => ({ ...(r.body as object), id: r.entries[0].id })) },
    entries: single.flatMap((r) => r.entries),
    single,
  };
}

function upsertRequest(entry: OutboxEntry, row: Row): PushRequest {
  const path = entry.table === 'settings' ? PATHS.settings : `${PATHS[entry.table]}/${entry.id}`;
  return { method: 'PUT', path, body: upsertBody(entry.table, row), entries: [entry] };
}

/** A stored row as the API's upsert DTO; the API refuses fields it doesn't know. */
export function upsertBody(table: SyncedTable, row: object): unknown {
  switch (table) {
    case 'settings': {
      const { weekStartDay, defaultCurrency } = row as unknown as StoredSettings;
      return { weekStartDay, defaultCurrency } satisfies ApiSchemas['UpdateSettingsDto'];
    }
    case 'accounts': {
      const { name, type, currency, openingBalance, sortOrder } = row as StoredAccount;
      return { name, type, currency, openingBalance, sortOrder } satisfies ApiSchemas['UpsertAccountDto'];
    }
    case 'categories': {
      const { name, parentId, sortOrder } = row as StoredCategory;
      return { name, parentId, sortOrder } satisfies ApiSchemas['UpsertCategoryDto'];
    }
    case 'planVersions': {
      const { effectiveFromMonth, note, items } = row as StoredPlanVersion;
      return { effectiveFromMonth, note, items } satisfies ApiSchemas['UpsertPlanVersionDto'];
    }
    case 'records': {
      const r = row as StoredRecord;
      return {
        type: r.type,
        occurredOn: r.occurredOn,
        occurredAt: r.occurredAt,
        accountId: r.accountId,
        currency: r.currency,
        counterAccountId: r.counterAccountId,
        counterAmount: r.counterAmount,
        targetBalance: r.targetBalance,
        note: r.note,
        lines: r.lines.map(({ fxRate, ...line }) => ({ ...line, ...(fxRate === null ? {} : { fxRate }) })),
      } satisfies ApiSchemas['UpsertRecordDto'];
    }
    case 'budgetTransfers': {
      const { occurredOn, occurredAt, fromItemId, toItemId, amount, note } = row as StoredBudgetTransfer;
      return { occurredOn, occurredAt, fromItemId, toItemId: toItemId ?? '', amount, note } satisfies ApiSchemas['UpsertBudgetTransferDto'];
    }
  }
}

/** A pull's rows as device changes. */
export function pulledChanges(changes: ApiSchemas['SyncChangesDto']): DeviceChanges {
  const result: DeviceChanges = {
    accounts: changes.accounts,
    categories: changes.categories,
    records: changes.records,
    planVersions: changes.planVersions,
    budgetTransfers: changes.budgetTransfers,
  };
  if (changes.settings) result.settings = { id: 'settings', ...changes.settings };
  return result;
}

function rowsByKey(data: DeviceSnapshot): Map<string, Row> {
  const rows = new Map<string, Row>();
  for (const table of ['accounts', 'categories', 'records', 'planVersions', 'budgetTransfers'] as const) {
    for (const row of data[table]) rows.set(`${table}:${row.id}`, row);
  }
  if (data.settings) rows.set(`settings:${data.settings.id}`, data.settings);
  return rows;
}

/** How deep each category sits in the tree, so parents reach the server first. */
function categoryDepths(categories: readonly StoredCategory[]): Map<string, number> {
  const parents = new Map(categories.map((c) => [c.id, c.parentId]));
  const depths = new Map<string, number>();
  for (const category of categories) {
    let depth = 0;
    let parent = category.parentId;
    const seen = new Set<string>();
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      depth += 1;
      parent = parents.get(parent) ?? null;
    }
    depths.set(category.id, depth);
  }
  return depths;
}
