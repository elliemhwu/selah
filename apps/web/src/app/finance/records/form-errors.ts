import type { AbstractControl } from '@angular/forms';

/** Money as the API accepts it: positive, up to 2 decimals (ADR 0006). */
export const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
/** Money that may be negative, such as an opening balance or an actual balance. */
export const SIGNED_MONEY_PATTERN = /^-?\d{1,12}(\.\d{1,2})?$/;
/** An exchange rate: up to 8 decimals. */
export const RATE_PATTERN = /^\d{1,10}(\.\d{1,8})?$/;

/** Rejects zero amounts; the record type sets the direction. */
export function positiveAmount(control: AbstractControl<string>) {
  return /[1-9]/.test(control.value ?? '') || !control.value ? null : { positive: true };
}

/** The message to show under a field, server errors first. */
export function errorText(control: AbstractControl): string {
  const errors = control.errors;
  if (!errors) return '';
  if (errors['server']) return errors['server'] as string;
  if (errors['required']) return $localize`:@@error.required:Required.`;
  if (errors['positive']) return $localize`:@@error.positive:Must be more than zero.`;
  if (errors['pattern']) return $localize`:@@error.number:Enter a number with up to 2 decimals.`;
  if (errors['rate']) return $localize`:@@error.rate:Enter a rate with up to 8 decimals.`;
  if (errors['maxlength']) return $localize`:@@error.tooLong:Too long.`;
  return $localize`:@@error.invalid:Not valid.`;
}
