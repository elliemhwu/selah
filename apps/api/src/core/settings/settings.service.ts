import { Injectable } from '@nestjs/common';
import type { Currency, IsoWeekday } from '@selah/shared-types';
import type { SettingsDto, UpdateSettingsDto } from './settings.dto';
import { SettingsRepository } from './settings.repository';

/** What applies before the settings are first saved; matches the column defaults. */
const DEFAULTS: SettingsDto = { weekStartDay: 1, defaultCurrency: 'TWD', updatedAt: null };

/** App-wide settings: a single resource with no id (ADR 0024). */
@Injectable()
export class SettingsService {
  constructor(private readonly settings: SettingsRepository) {}

  async get(): Promise<SettingsDto> {
    const row = await this.settings.findLive();
    if (!row) return DEFAULTS;
    return {
      weekStartDay: row.weekStartDay as IsoWeekday,
      defaultCurrency: row.defaultCurrency as Currency,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Replaces every setting at once. */
  async update(input: UpdateSettingsDto): Promise<SettingsDto> {
    await this.settings.save({ weekStartDay: input.weekStartDay, defaultCurrency: input.defaultCurrency });
    return this.get();
  }
}
