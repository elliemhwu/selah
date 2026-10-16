import { BackupError, backupFileName, parseBackup, toBackupJson } from './backup';
import { EMPTY_SNAPSHOT } from './device-storage';
import { storedAccount, storedRecord } from './testing';

const snapshot = {
  ...EMPTY_SNAPSHOT,
  accounts: [storedAccount('cash')],
  records: [storedRecord('r1'), storedRecord('gone', { deletedAt: '2026-10-02T00:00:00Z' })],
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

  it.each([
    ['text that is not JSON', 'hello'],
    ['another JSON file', JSON.stringify({ name: 'something' })],
    ['a backup with a broken table', JSON.stringify({ format: 'selah-backup', version: 1, exportedAt: 'x', data: { accounts: [{}] } })],
  ])('refuses %s', (_, text) => {
    expect(() => parseBackup(text)).toThrow(BackupError);
    expect(() => parseBackup(text)).toThrow("This file isn't a Selah backup.");
  });

  it('asks for an update to read a newer backup', () => {
    const newer = JSON.stringify({ format: 'selah-backup', version: 2, exportedAt: 'x', data: {} });
    expect(() => parseBackup(newer)).toThrow('This backup comes from a newer version of Selah.');
  });
});
