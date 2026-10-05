// Value sets shared by web, api and shared-utils. They mirror the CHECK
// constraints in db/migrations; change both together.

/** Supported currencies (ADR 0006). */
export const CURRENCIES = ['TWD', 'JPY', 'EUR', 'GBP', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Currencies whose amounts must be whole units (ADR 0006). */
export const WHOLE_UNIT_CURRENCIES: readonly Currency[] = ['TWD', 'JPY'];

export const ACCOUNT_TYPES = [
  'cash',
  'bank',
  'credit_card',
  'stored_value',
  'gift_card',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const RECORD_TYPES = ['income', 'expense', 'transfer', 'adjustment'] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

/** Plan sections, in display order (requirements §3). */
export const SECTIONS = ['income', 'government', 'offering', 'saving', 'expense'] as const;
export type Section = (typeof SECTIONS)[number];

export const CADENCES = ['daily', 'weekly', 'monthly', 'yearly', 'one_time'] as const;
export type Cadence = (typeof CADENCES)[number];

export const RESET_CYCLES = ['never', 'week', 'month', 'year'] as const;
export type ResetCycle = (typeof RESET_CYCLES)[number];

export const RESET_ACTIONS = ['drop', 'carry'] as const;
export type ResetAction = (typeof RESET_ACTIONS)[number];

export const BUDGET_TRANSFER_KINDS = ['manual', 'reset'] as const;
export type BudgetTransferKind = (typeof BUDGET_TRANSFER_KINDS)[number];

/** ISO day of week: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** A local calendar date, 'YYYY-MM-DD', with no time zone (ADR 0014). */
export type LocalDate = string;

/** A calendar month, 'YYYY-MM'. */
export type YearMonth = string;
