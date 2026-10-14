import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import type { ApiSchemas } from '@selah/api-client';
import { firstValueFrom } from 'rxjs';

export type SettingsDto = ApiSchemas['SettingsDto'];
export type UpdateSettingsDto = ApiSchemas['UpdateSettingsDto'];

const URL = '/api/v1/core/settings';
/** What the API returns before the settings are first saved. */
const DEFAULTS: SettingsDto = { weekStartDay: 1, defaultCurrency: 'TWD', updatedAt: null };

/**
 * App-wide settings (ADR 0024). The shell loads them once, so forms can read
 * them without a request of their own; the defaults apply until they arrive.
 */
@Injectable({ providedIn: 'root' })
export class AppSettings {
  private readonly http = inject(HttpClient);
  private readonly state = signal<SettingsDto>(DEFAULTS);
  readonly value = this.state.asReadonly();
  readonly status = signal<'idle' | 'loading' | 'loaded' | 'error'>('idle');

  async load(): Promise<void> {
    this.status.set('loading');
    try {
      this.state.set(await firstValueFrom(this.http.get<SettingsDto>(URL)));
      this.status.set('loaded');
    } catch {
      this.status.set('error');
    }
  }

  /** Replaces every setting; the stored value changes only once the API accepts it. */
  async save(settings: UpdateSettingsDto): Promise<void> {
    this.state.set(await firstValueFrom(this.http.put<SettingsDto>(URL, settings)));
    this.status.set('loaded');
  }
}
