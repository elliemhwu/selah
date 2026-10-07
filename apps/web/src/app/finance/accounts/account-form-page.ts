import { Component, computed, effect, inject, signal } from '@angular/core';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { type AccountType, CURRENCIES, type Currency } from '@selah/shared-types';
import { applyFieldErrors, problemOf } from '../../core/problem';
import { FormNavigation } from '../../ui/form-navigation';
import { Toast } from '../../ui/toast';
import { AccountsApi } from '../data/finance-api';
import { toInputAmount } from '../records/budget-item-options';
import { errorText, SIGNED_MONEY_PATTERN } from '../records/form-errors';
import { ACCOUNT_TYPE_OPTIONS } from './account-labels';

/**
 * Creates, edits or deletes an account (requirements §1).
 * Routes: `/accounts/new`, `/accounts/:id` (ADR 0022).
 */
@Component({
  selector: 'selah-account-form-page',
  host: { class: 'form-page' },
  imports: [ReactiveFormsModule],
  templateUrl: './account-form-page.html',
})
export class AccountFormPage {
  private readonly accountsApi = inject(AccountsApi);
  private readonly nav = inject(FormNavigation);
  private readonly toast = inject(Toast);
  /** The account being edited; undefined on `/accounts/new`. */
  private readonly editId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? undefined;
  /** A new account's id is generated once, so a retry never duplicates it (ADR 0017). */
  private readonly id = this.editId ?? crypto.randomUUID();
  private readonly loaded = this.accountsApi.get(() => this.editId);

  protected readonly editing = !!this.editId;
  protected readonly account = computed(() => (this.loaded.hasValue() ? this.loaded.value() : undefined));
  protected readonly loading = computed(() => this.editing && this.loaded.isLoading());
  protected readonly notFound = computed(() => this.editing && !!this.loaded.error());

  protected readonly types = ACCOUNT_TYPE_OPTIONS;
  protected readonly currencies = CURRENCIES;
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(100), Validators.pattern(/\S/)]],
    type: 'cash' as AccountType,
    currency: 'TWD' as Currency,
    openingBalance: ['0', [Validators.required, Validators.pattern(SIGNED_MONEY_PATTERN)]],
  });
  protected readonly saving = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly errorText = errorText;

  constructor() {
    // Fill the form once the account arrives, unless the user already typed.
    effect(() => {
      const account = this.account();
      if (!account || this.form.dirty) return;
      this.form.setValue({
        name: account.name,
        type: account.type,
        currency: account.currency,
        openingBalance: toInputAmount(account.openingBalance),
      });
    });
  }

  protected cancel(): void {
    this.nav.leave('/accounts');
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.loading() || this.notFound()) {
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
        sortOrder: this.account()?.sortOrder ?? 0,
      });
      this.nav.leave('/accounts', $localize`:@@accounts.saved:Account saved.`);
    } catch (error) {
      const unmatched = applyFieldErrors(problemOf(error), (field) => this.controlFor(field));
      if (unmatched.length) this.toast.show(unmatched.join(' '));
    } finally {
      this.saving.set(false);
    }
  }

  async remove(): Promise<void> {
    if (!this.editId) return;
    if (!this.confirmingDelete()) {
      this.confirmingDelete.set(true);
      return;
    }
    this.saving.set(true);
    try {
      await this.accountsApi.remove(this.editId);
      this.nav.leave('/accounts', $localize`:@@accounts.deleted:Account deleted.`);
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
