import { toDayNumber } from '@selah/shared-utils';
import { type FieldErrors, RuleViolationError } from './errors';

// Calendar checks for request dates the format validators can't catch (2026-02-30).

export function isRealDate(date: string): boolean {
  try {
    toDayNumber(date);
    return true;
  } catch {
    return false;
  }
}

/** Throws 422 unless `from`..`to` is a real, ordered date range. */
export function assertDateRange(from: string, to: string): void {
  const errors: FieldErrors = {};
  if (!isRealDate(from)) errors['from'] = ['from is not a real date'];
  if (!isRealDate(to)) errors['to'] = ['to is not a real date'];
  if (!errors['from'] && !errors['to'] && from > to) errors['to'] = ['to must not be before from'];
  if (Object.keys(errors).length) throw new RuleViolationError('The date range is invalid.', errors);
}
