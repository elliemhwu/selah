import { computed, DestroyRef, inject, Injectable, InjectionToken, signal } from '@angular/core';
import {
  applyChanges,
  type DeviceChanges,
  type DeviceSnapshot,
  type DeviceStorage,
  DexieStorage,
  EMPTY_SNAPSHOT,
} from './device-storage';

/** Where the data is kept; tests provide a MemoryStorage instead. */
export const DEVICE_STORAGE = new InjectionToken<DeviceStorage>('DEVICE_STORAGE', {
  providedIn: 'root',
  factory: () => new DexieStorage(),
});

/**
 * All the data on this device, in memory (ADR 0025, 0026). It loads once at
 * start, follows changes from other tabs, and writes through the storage.
 */
@Injectable({ providedIn: 'root' })
export class DeviceStore {
  private readonly storage = inject(DEVICE_STORAGE);
  private readonly state = signal<DeviceSnapshot>(EMPTY_SNAPSHOT);
  private readonly loadState = signal<'loading' | 'ready' | 'error'>('loading');
  private loading: Promise<void>;

  private readonly saves = signal(0);

  /** Every row, deleted ones included. */
  readonly data = this.state.asReadonly();
  /** Counts the saves made on this device in this tab, which sync follows (ADR 0028). */
  readonly localSaves = this.saves.asReadonly();
  readonly status = this.loadState.asReadonly();
  readonly ready = computed(() => this.loadState() === 'ready');

  constructor() {
    this.loading = this.load();
    const stop = this.storage.watch((snapshot) => {
      this.state.set(snapshot);
      this.loadState.set('ready');
    });
    inject(DestroyRef).onDestroy(stop);
  }

  /** Resolves once the data is loaded (or failed to load). */
  whenLoaded(): Promise<void> {
    return this.loading;
  }

  /** Tries loading again after a failure. */
  reload(): Promise<void> {
    this.loadState.set('loading');
    this.loading = this.load();
    return this.loading;
  }

  /** Writes the changes together and queues them for sync, then shows them. */
  async save(changes: DeviceChanges): Promise<void> {
    await this.storage.save(changes);
    this.state.update((snapshot) => applyChanges(snapshot, changes));
    this.saves.update((n) => n + 1);
  }

  /** Writes rows pulled from the server, except those waiting to be pushed, then shows them. */
  async saveFromServer(changes: DeviceChanges): Promise<void> {
    const applied = await this.storage.saveFromServer(changes);
    this.state.update((snapshot) => applyChanges(snapshot, applied));
  }

  /** Replaces everything on the device, such as when restoring a backup. */
  async replace(snapshot: DeviceSnapshot): Promise<void> {
    await this.storage.replace(snapshot);
    this.state.set(snapshot);
    this.loadState.set('ready');
  }

  private async load(): Promise<void> {
    try {
      this.state.set(await this.storage.load());
      this.loadState.set('ready');
    } catch {
      this.loadState.set('error');
    }
  }
}
