import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { type AccountType, CURRENCIES, type Currency } from '@selah/shared-types';
import { applyFieldErrors, problemOf } from '../../core/problem';
import { Toast } from '../../ui/toast';
import { type AccountDto, AccountsApi } from '../data/finance-api';
import { toInputAmount } from '../records/budget-item-options';
import { errorText, SIGNED_MONEY_PATTERN } from '../records/form-errors';
import { ACCOUNT_TYPE_OPTIONS } from './account-labels';

export interface AccountDialogData {
  /** The account to edit; none to create one. */
  account?: AccountDto;
}

export type AccountDialogResult = 'saved' | 'deleted';

/** Creates, edits or deletes an account (requirements §1). */
@Component({
  selector: 'selah-account-dialog',
  imports: [ReactiveFormsModule],
  templateUrl: './account-dialog.html',
})
export class AccountDialog {
  protected readonly account = inject<AccountDialogData | null>(DIALOG_DATA, { optional: true })?.account;
  private readonly dialogRef = inject<DialogRef<AccountDialogResult, AccountDialog>>(DialogRef);
  private readonly accountsApi = inject(AccountsApi);
  private readonly toast = inject(Toast);
  /** A new account's id is generated once, so a retry never duplicates it (ADR 0017). */
  private readonly id = this.account?.id ?? crypto.randomUUID();

  protected readonly types = ACCOUNT_TYPE_OPTIONS;
  protected readonly currencies = CURRENCIES;
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [this.account?.name ?? '', [Validators.required, Validators.maxLength(100), Validators.pattern(/\S/)]],
    type: (this.account?.type ?? 'cash') as AccountType,
    currency: (this.account?.currency ?? 'TWD') as Currency,
    openingBalance: [
      this.account ? toInputAmount(this.account.openingBalance) : '0',
      [Validators.required, Validators.pattern(SIGNED_MONEY_PATTERN)],
    ],
  });
  protected readonly saving = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly errorText = errorText;

  protected cancel(): void {
    this.dialogRef.close();
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    try {
      await this.accountsApi.upsert(this.id, {
        name: v.name.trim(),
        type: v.type,
        currency: v.currency,
        openingBalance: v.openingBalance,
        sortOrder: this.account?.sortOrder ?? 0,
      });
      this.dialogRef.close('saved');
    } catch (error) {
      const unmatched = applyFieldErrors(problemOf(error), (field) => this.controlFor(field));
      if (unmatched.length) this.toast.show(unmatched.join(' '));
    } finally {
      this.saving.set(false);
    }
  }

  async remove(): Promise<void> {
    if (!this.account) return;
    if (!this.confirmingDelete()) {
      this.confirmingDelete.set(true);
      return;
    }
    this.saving.set(true);
    try {
      await this.accountsApi.remove(this.account.id);
      this.dialogRef.close('deleted');
    } catch (error) {
      // 409 while the account still has records.
      this.toast.show(problemOf(error).message);
      this.confirmingDelete.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  private controlFor(field: string): AbstractControl | undefined {
    return (this.form.controls as Record<string, AbstractControl>)[field];
  }
}
