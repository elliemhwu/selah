import { computed, inject, Injectable } from '@angular/core';
import { DEFAULT_SETTINGS, type SettingsValues } from '@selah/finance-core';
import { DeviceStore } from '../data/device-store';

export interface SettingsDto extends SettingsValues {
  /** Null until the settings are first saved; the defaults apply until then. */
  updatedAt: string | null;
}
export type UpdateSettingsDto = SettingsValues;

/**
 * App-wide settings (ADR 0024), kept on the device with everything else
 * (ADR 0025). The defaults apply until they are first saved.
 */
@Injectable({ providedIn: 'root' })
export class AppSettings {
  private readonly store = inject(DeviceStore);

  readonly value = computed<SettingsDto>(() => {
    const stored = this.store.data().settings;
    return stored
      ? { weekStartDay: stored.weekStartDay, defaultCurrency: stored.defaultCurrency, updatedAt: stored.updatedAt }
      : { ...DEFAULT_SETTINGS, updatedAt: null };
  });
  readonly status = computed(() => {
    const status = this.store.status();
    return status === 'ready' ? 'loaded' : status;
  });

  /** Tries opening the device's data again after a failure. */
  reload(): Promise<void> {
    return this.store.reload();
  }

  /** Replaces every setting. */
  async save(settings: UpdateSettingsDto): Promise<void> {
    await this.store.save({ settings: { id: 'settings', ...settings, updatedAt: new Date().toISOString() } });
  }
}
