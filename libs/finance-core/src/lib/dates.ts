import { toDayNumber } from '@selah/shared-utils';
import { type FieldErrors, RuleViolationError } from './errors';

// Calendar checks the format checks can't catch, such as 2026-02-30.

export function isRealDate(date: string): boolean {
  try {
    toDayNumber(date);
    return true;
  } catch {
    return false;
  }
}

/** Throws unless `from`..`to` is a real, ordered date range. */
export function assertDateRange(from: string, to: string): void {
  const errors: FieldErrors = {};
  if (!isRealDate(from)) errors['from'] = ['from is not a real date'];
  if (!isRealDate(to)) errors['to'] = ['to is not a real date'];
  if (!errors['from'] && !errors['to'] && from > to) errors['to'] = ['to must not be before from'];
  if (Object.keys(errors).length) throw new RuleViolationError('The date range is invalid.', errors);
}

/** Throws unless `date` is a real day. */
export function assertRealDate(date: string): void {
  if (!isRealDate(date)) throw new RuleViolationError('The date is invalid.', { date: ['date is not a real date'] });
}

/** A text field's value, or null when it is missing or blank. */
export function blankToNull(value: string | null | undefined): string | null {
  return value && value.trim() ? value : null;
}
