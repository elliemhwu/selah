import { inject, LOCALE_ID, Pipe, type PipeTransform } from '@angular/core';
import type { Currency } from '@selah/shared-types';
import { displayDecimals } from '@selah/shared-utils';

/**
 * Formats a decimal money string for display in the app's locale: "1234.50" →
 * "1,234.50", or "1,235" for TWD and JPY. The string goes to Intl as is, so it
 * never becomes a JS number (ADR 0006, 0020).
 */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);
  private readonly formats = new Map<Currency, Intl.NumberFormat>();

  transform(value: string | null | undefined, currency: Currency = 'TWD'): string {
    if (value == null || value === '') return '';
    let format = this.formats.get(currency);
    if (!format) {
      const digits = displayDecimals(currency);
      format = new Intl.NumberFormat(this.locale, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
        roundingMode: 'halfExpand',
      });
      this.formats.set(currency, format);
    }
    return format.format(value as Intl.StringNumericLiteral);
  }
}
