import { InjectionToken } from '@angular/core';
import type { LocalDate } from '@selah/shared-types';

/** A Date's local calendar day as 'YYYY-MM-DD' (ADR 0014). */
export function localDateOf(date: Date): LocalDate {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today on the device. Tests provide a fixed day instead (ADR 0020). */
export const TODAY = new InjectionToken<() => LocalDate>('TODAY', {
  providedIn: 'root',
  factory: () => () => localDateOf(new Date()),
});
