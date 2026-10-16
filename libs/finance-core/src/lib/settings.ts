import type { Currency, IsoWeekday } from '@selah/shared-types';

// App-wide settings (requirements §4, ADR 0024).

export interface SettingsValues {
  weekStartDay: IsoWeekday;
  defaultCurrency: Currency;
}

/** What applies before the settings are first saved; matches the column defaults. */
export const DEFAULT_SETTINGS: SettingsValues = { weekStartDay: 1, defaultCurrency: 'TWD' };
