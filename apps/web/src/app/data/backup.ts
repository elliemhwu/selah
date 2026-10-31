import type { LocalDate } from '@selah/shared-types';
import { type DeviceChanges, type DeviceSnapshot, EMPTY_SNAPSHOT } from './device-storage';

// The backup file (ADR 0025): everything on the device, deleted rows included,
// as JSON. Until sync exists, this is the only copy kept anywhere else.

const FORMAT = 'selah-backup';
const VERSION = 1;
const TABLES = ['accounts', 'categories', 'records', 'planVersions', 'budgetTransfers'] as const;
/** Added with the Journal (ADR 0030) and Planner (ADR 0033) modules; backups from before them don't have them. */
const LATER_TABLES = [
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

export interface BackupFile {
  format: typeof FORMAT;
  version: typeof VERSION;
  /** ISO timestamp. */
  exportedAt: string;
  data: DeviceSnapshot;
}

/** What a backup holds, to show before restoring it. */
export interface BackupSummary {
  exportedAt: string;
  /** Live records, as the Records screen counts them. */
  records: number;
  accounts: number;
}

/** A file that can't be restored; the message is for the user. */
export class BackupError extends Error {
  override name = 'BackupError';
}

export function backupFileName(today: LocalDate): string {
  return `selah-backup-${today}.json`;
}

export function toBackupJson(snapshot: DeviceSnapshot, exportedAt: string): string {
  const file: BackupFile = { format: FORMAT, version: VERSION, exportedAt, data: snapshot };
  return JSON.stringify(file);
}

/** Reads a backup file; throws BackupError for anything that isn't one this app wrote. */
export function parseBackup(text: string): { snapshot: DeviceSnapshot; summary: BackupSummary } {
  const notOurs = () => new BackupError($localize`:@@backup.notOurs:This file isn't a Selah backup.`);
  let file: Partial<BackupFile>;
  try {
    file = JSON.parse(text);
  } catch {
    throw notOurs();
  }
  if (!file || typeof file !== 'object' || file.format !== FORMAT || typeof file.exportedAt !== 'string') throw notOurs();
  if (file.version !== VERSION) {
    throw new BackupError($localize`:@@backup.newer:This backup comes from a newer version of Selah. Update the app, then try again.`);
  }
  const data = file.data as Partial<DeviceSnapshot> | undefined;
  if (!data || typeof data !== 'object') throw notOurs();
  const isRows = (rows: unknown) => Array.isArray(rows) && rows.every((row) => !!row && typeof (row as { id?: unknown }).id === 'string');
  if (!TABLES.every((table) => isRows(data[table]))) throw notOurs();
  if (!LATER_TABLES.every((table) => data[table] === undefined || isRows(data[table]))) throw notOurs();
  const settings = data.settings ?? null;
  if (settings !== null && (typeof settings !== 'object' || settings.id !== 'settings')) throw notOurs();

  const snapshot = { ...EMPTY_SNAPSHOT, ...data, settings } as DeviceSnapshot;
  return {
    snapshot,
    summary: {
      exportedAt: file.exportedAt,
      records: snapshot.records.filter((r) => !r.deletedAt).length,
      accounts: snapshot.accounts.filter((a) => !a.deletedAt).length,
    },
  };
}

/** What merging a backup would change on this device (ADR 0034). */
export interface MergePlan {
  /** The rows to save: ones this device doesn't have, and newer versions of ones it has. */
  changes: DeviceChanges;
  added: number;
  updated: number;
}

/**
 * Merges a backup into this device's data, row by row (ADR 0034). Rows are
 * matched by id; the later `updatedAt` wins and a tie keeps this device's row.
 * A soft delete is a row like any other, so deletions carry over. Nothing is
 * removed.
 */
export function mergeBackup(current: DeviceSnapshot, incoming: DeviceSnapshot): MergePlan {
  const changes: Record<string, unknown> = {};
  let added = 0;
  let updated = 0;
  for (const table of [...TABLES, ...LATER_TABLES]) {
    const mine = new Map((current[table] as { id: string; updatedAt: string }[]).map((row) => [row.id, row]));
    const take: unknown[] = [];
    for (const row of (incoming[table] ?? []) as { id: string; updatedAt: string }[]) {
      const own = mine.get(row.id);
      if (!own) added++;
      else if (row.updatedAt > own.updatedAt) updated++;
      else continue;
      take.push(row);
    }
    if (take.length) changes[table] = take;
  }
  const settings = incoming.settings;
  if (settings && (!current.settings || settings.updatedAt > current.settings.updatedAt)) {
    changes['settings'] = settings;
    updated++;
  }
  return { changes: changes as DeviceChanges, added, updated };
}
