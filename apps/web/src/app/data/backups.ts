import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import { TODAY } from '../core/today';
import { backupFileName, type BackupSummary, mergeBackup, type MergePlan, parseBackup, toBackupJson } from './backup';
import type { DeviceSnapshot } from './device-storage';
import { DeviceStore } from './device-store';

/** Hands a file to the user; tests replace it. */
export const SAVE_FILE = new InjectionToken<(name: string, text: string) => void>('SAVE_FILE', {
  providedIn: 'root',
  factory: () => (name, text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
});

const LAST_BACKUP_KEY = 'selah.lastBackup';

export type Persistence = 'persisted' | 'best-effort' | 'unknown';

/** A backup chosen to restore, waiting for the user to confirm. */
export interface PendingRestore {
  fileName: string;
  summary: BackupSummary;
  snapshot: DeviceSnapshot;
  /** What merging it would change (ADR 0034). */
  merge: MergePlan;
}

/**
 * Backups and storage safety (ADR 0025): until sync exists, a downloaded
 * backup is the only copy of the data anywhere but this browser.
 */
@Injectable({ providedIn: 'root' })
export class Backups {
  private readonly store = inject(DeviceStore);
  private readonly saveFile = inject(SAVE_FILE);
  private readonly today = inject(TODAY);

  /** When this device last downloaded a backup (ISO), if ever. Kept per device. */
  readonly lastBackupAt = signal<string | null>(readLastBackup());
  /** Whether the browser promised to keep the data when space runs low. */
  readonly persistence = signal<Persistence>('unknown');

  /** Asks the browser to keep the data; installed apps are usually granted this. */
  async requestPersistence(): Promise<void> {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (!storage?.persist) return;
    try {
      const persisted = (await storage.persisted?.()) || (await storage.persist());
      this.persistence.set(persisted ? 'persisted' : 'best-effort');
    } catch {
      this.persistence.set('best-effort');
    }
  }

  /** Downloads everything on the device as one file. */
  download(): void {
    const now = new Date().toISOString();
    this.saveFile(backupFileName(this.today()), toBackupJson(this.store.data(), now));
    this.lastBackupAt.set(now);
    try {
      localStorage.setItem(LAST_BACKUP_KEY, now);
    } catch {
      // Storage may be blocked; the date just won't be remembered.
    }
  }

  /** Reads a chosen file; throws BackupError when it can't be restored. */
  async read(file: File): Promise<PendingRestore> {
    const { snapshot, summary } = parseBackup(await readText(file));
    return { fileName: file.name, summary, snapshot, merge: mergeBackup(this.store.data(), snapshot) };
  }

  /** Adds the backup's new and newer rows to the device in one save; nothing is removed (ADR 0034). */
  async merge(pending: PendingRestore): Promise<void> {
    // Worked out again now, in case the data changed since the file was chosen.
    const { changes } = mergeBackup(this.store.data(), pending.snapshot);
    if (Object.keys(changes).length) await this.store.save(changes);
  }

  /** Replaces everything on the device with the backup. */
  restore(pending: PendingRestore): Promise<void> {
    return this.store.replace(pending.snapshot);
  }
}

/** A file's text; FileReader works in every browser that runs the app. */
function readText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function readLastBackup(): string | null {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}
