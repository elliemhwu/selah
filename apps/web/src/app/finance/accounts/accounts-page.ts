import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CURRENCIES } from '@selah/shared-types';
import { formatMoney, parseMoney, sumCents } from '@selah/shared-utils';
import { MoneyPipe } from '../../core/money.pipe';
import { Icon } from '../../ui/icon';
import { AccountsApi } from '../data/finance-api';
import { ACCOUNT_TYPE_LABELS } from './account-labels';

/** Accounts (requirements §1, §4): derived balances; forms open as routes (ADR 0022). */
@Component({
  selector: 'selah-accounts-page',
  imports: [Icon, MoneyPipe, RouterLink],
  templateUrl: './accounts-page.html',
  styleUrl: './accounts-page.scss',
})
export class AccountsPage {
  protected readonly accounts = inject(AccountsApi).list();
  protected readonly typeLabels = ACCOUNT_TYPE_LABELS;

  /** One total per currency; there are no live rates to combine them (requirements §6). */
  protected readonly totals = computed(() =>
    CURRENCIES.flatMap((currency) => {
      const inCurrency = this.accounts.value().filter((a) => a.currency === currency);
      if (inCurrency.length === 0) return [];
      const total = sumCents(inCurrency.map((a) => parseMoney(a.balance)));
      return [{ currency, total: formatMoney(total) }];
    }),
  );

  protected isNegative(amount: string): boolean {
    return amount.startsWith('-');
  }
}
