import { Dialog } from '@angular/cdk/dialog';
import { Component, computed, inject } from '@angular/core';
import { CURRENCIES } from '@selah/shared-types';
import { formatMoney, parseMoney, sumCents } from '@selah/shared-utils';
import { MoneyPipe } from '../../core/money.pipe';
import { LEDGER_DIALOG } from '../../ui/dialog';
import { Icon } from '../../ui/icon';
import { Toast } from '../../ui/toast';
import { type AccountDto, AccountsApi } from '../data/finance-api';
import { AccountDialog, type AccountDialogData, type AccountDialogResult } from './account-dialog';
import { ACCOUNT_TYPE_LABELS } from './account-labels';
import { AdjustDialog, type AdjustDialogData } from './adjust-dialog';
import { TransferDialog, type TransferDialogData } from './transfer-dialog';

/** Accounts (requirements §1, §4): derived balances, transfers and adjustments. */
@Component({
  selector: 'selah-accounts-page',
  imports: [Icon, MoneyPipe],
  templateUrl: './accounts-page.html',
  styleUrl: './accounts-page.scss',
})
export class AccountsPage {
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(Toast);
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

  protected newAccount(): void {
    this.openAccount({});
  }

  protected edit(account: AccountDto): void {
    this.openAccount({ account });
  }

  protected transfer(): void {
    const data: TransferDialogData = { accounts: this.accounts.value() };
    this.dialog.open(TransferDialog, { ...LEDGER_DIALOG, data }).closed.subscribe((saved) => {
      if (saved) this.refresh($localize`:@@accounts.transferSaved:Transfer saved.`);
    });
  }

  protected adjust(): void {
    const data: AdjustDialogData = { accounts: this.accounts.value() };
    this.dialog.open(AdjustDialog, { ...LEDGER_DIALOG, data }).closed.subscribe((saved) => {
      if (saved) this.refresh($localize`:@@accounts.adjusted:Balance adjusted.`);
    });
  }

  private openAccount(data: AccountDialogData): void {
    this.dialog
      .open<AccountDialogResult>(AccountDialog, { ...LEDGER_DIALOG, data })
      .closed.subscribe((result) => {
        if (result === 'saved') this.refresh($localize`:@@accounts.saved:Account saved.`);
        if (result === 'deleted') this.refresh($localize`:@@accounts.deleted:Account deleted.`);
      });
  }

  private refresh(message: string): void {
    this.accounts.reload();
    this.toast.show(message);
  }
}
