import { BackupError, backupFileName, parseBackup, toBackupJson } from './backup';
import { EMPTY_SNAPSHOT } from './device-storage';
import {
  storedAccount,
  storedArea,
  storedComment,
  storedGodNote,
  storedJournal,
  storedMoment,
  storedProject,
  storedRecord,
  storedTask,
  storedTaskRecord,
} from './testing';

const snapshot = {
  ...EMPTY_SNAPSHOT,
  accounts: [storedAccount('cash')],
  records: [storedRecord('r1'), storedRecord('gone', { deletedAt: '2026-10-02T00:00:00Z' })],
  moments: [storedMoment('m1')],
  journals: [storedJournal('j1', { momentId: 'm1' })],
  comments: [storedComment('c1', { journalId: 'j1' })],
  godNotes: [storedGodNote('g1', 'j1')],
  areas: [storedArea('a1')],
  projects: [storedProject('p1', 'a1')],
  tasks: [storedTask('t1', { projectId: 'p1', planStart: '2026-11-02', planGrain: 'week' })],
  taskRecords: [storedTaskRecord('tr1', 't1')],
  settings: { id: 'settings' as const, weekStartDay: 7 as const, defaultCurrency: 'JPY' as const, updatedAt: 'x' },
};

describe('backup files', () => {
  it('names the file by day', () => {
    expect(backupFileName('2026-10-15')).toBe('selah-backup-2026-10-15.json');
  });

  it('keeps everything, deleted rows included, and reads it back', () => {
    const { snapshot: restored, summary } = parseBackup(toBackupJson(snapshot, '2026-10-15T08:00:00Z'));
    expect(restored).toEqual(snapshot);
    expect(summary).toEqual({ exportedAt: '2026-10-15T08:00:00Z', records: 1, accounts: 1 });
  });

  it('treats a backup without settings as settings never saved', () => {
    const json = JSON.stringify({
      format: 'selah-backup',
      version: 1,
      exportedAt: 'x',
      data: { accounts: [], categories: [], records: [], planVersions: [], budgetTransfers: [] },
    });
    expect(parseBackup(json).snapshot.settings).toBeNull();
  });

  it('restores a backup from before the Journal module with no journal rows (ADR 0030)', () => {
    const json = JSON.stringify({
      format: 'selah-backup',
      version: 1,
      exportedAt: 'x',
      data: { accounts: [], categories: [], records: [], planVersions: [], budgetTransfers: [], settings: null },
    });
    expect(parseBackup(json).snapshot).toMatchObject({ moments: [], journals: [], comments: [], godNotes: [] });
  });

  it('restores a backup from before the Planner module with no planner rows (ADR 0033)', () => {
    const json = JSON.stringify({
      format: 'selah-backup',
      version: 1,
      exportedAt: 'x',
      data: { accounts: [], categories: [], records: [], planVersions: [], budgetTransfers: [], moments: [], settings: null },
    });
    expect(parseBackup(json).snapshot).toMatchObject({ areas: [], projects: [], tasks: [], taskRecords: [], changeLog: [] });
  });

  it.each([
    ['text that is not JSON', 'hello'],
    ['another JSON file', JSON.stringify({ name: 'something' })],
    ['a backup with a broken table', JSON.stringify({ format: 'selah-backup', version: 1, exportedAt: 'x', data: { accounts: [{}] } })],
    [
      'a backup with a broken journal table',
      JSON.stringify({
        format: 'selah-backup',
        version: 1,
        exportedAt: 'x',
        data: { accounts: [], categories: [], records: [], planVersions: [], budgetTransfers: [], journals: [{}] },
      }),
    ],
    [
      'a backup with a broken planner table',
      JSON.stringify({
        format: 'selah-backup',
        version: 1,
        exportedAt: 'x',
        data: { accounts: [], categories: [], records: [], planVersions: [], budgetTransfers: [], tasks: 'none' },
      }),
    ],
  ])('refuses %s', (_, text) => {
    expect(() => parseBackup(text)).toThrow(BackupError);
    expect(() => parseBackup(text)).toThrow("This file isn't a Selah backup.");
  });

  it('asks for an update to read a newer backup', () => {
    const newer = JSON.stringify({ format: 'selah-backup', version: 2, exportedAt: 'x', data: {} });
    expect(() => parseBackup(newer)).toThrow('This backup comes from a newer version of Selah.');
  });
});
