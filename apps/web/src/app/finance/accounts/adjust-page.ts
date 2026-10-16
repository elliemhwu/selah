import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { MoneyPipe } from '../../core/money.pipe';
import { applyFieldErrors, problemOf } from '../../core/problem';
import { TODAY } from '../../core/today';
import { FormNavigation } from '../../ui/form-navigation';
import { Toast } from '../../ui/toast';
import { type AccountDto, AccountsApi, RecordsApi } from '../data/finance-api';
import { toInputAmount } from '../records/budget-item-options';
import { errorText, SIGNED_MONEY_PATTERN } from '../records/form-errors';

/**
 * Sets an account to its actual balance (ADR 0014). Only the target is
 * stored; the difference is calculated, so later edits keep it exact.
 * Route: `/accounts/adjust?account=<account id>` (ADR 0022).
 */
@Component({
  selector: 'selah-adjust-page',
  host: { class: 'form-page' },
  imports: [ReactiveFormsModule, MoneyPipe],
  templateUrl: './adjust-page.html',
})
export class AdjustPage {
  private readonly accountParam = inject(ActivatedRoute).snapshot.queryParamMap.get('account');
  private readonly nav = inject(FormNavigation);
  private readonly recordsApi = inject(RecordsApi);
  private readonly toast = inject(Toast);
  /** The adjustment being edited, from `/accounts/adjust/:id`; undefined for a new one. */
  private readonly editId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? undefined;
  protected readonly editing = !!this.editId;
  private readonly id = this.editId ?? crypto.randomUUID();
  private readonly loaded = this.recordsApi.get(() => this.editId);
  private filled = false;
  protected readonly loading = computed(() => this.editing && this.loaded.isLoading());
  protected readonly notFound = computed(() => this.editing && !!this.loaded.error());
  protected readonly confirmingDelete = signal(false);
  private readonly allAccounts = inject(AccountsApi).list();
  protected readonly accounts = computed(() => this.allAccounts.value());

  protected readonly form = inject(NonNullableFormBuilder).group({
    accountId: ['', Validators.required],
    occurredOn: [inject(TODAY)(), Validators.required],
    targetBalance: ['', [Validators.required, Validators.pattern(SIGNED_MONEY_PATTERN)]],
    note: ['', Validators.maxLength(500)],
  });
  private readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  protected readonly account = computed(() => this.accounts().find((a) => a.id === this.value().accountId));
  protected readonly saving = signal(false);
  protected readonly errorText = errorText;

  constructor() {
    // Editing: fill the form once the adjustment arrives.
    effect(() => {
      if (this.filled || !this.loaded.hasValue()) return;
      const record = this.loaded.value();
      this.filled = true;
      this.form.patchValue({
        accountId: record.accountId,
        occurredOn: record.occurredOn,
        targetBalance: toInputAmount(record.targetBalance ?? ''),
        note: record.note ?? '',
      });
    });
    effect(() => {
      const list = this.accounts();
      const control = this.form.controls.accountId;
      if (list.length === 0 || control.value) return;
      control.setValue((list.find((a) => a.id === this.accountParam) ?? list[0]).id);
    });
  }

  async remove(): Promise<void> {
    if (!this.editId) return;
    if (!this.confirmingDelete()) {
      this.confirmingDelete.set(true);
      return;
    }
    this.saving.set(true);
    try {
      await this.recordsApi.remove(this.editId);
      this.nav.leave('/records', $localize`:@@record.deleted:Entry deleted.`);
    } catch (error) {
      this.toast.show(problemOf(error).message);
      this.confirmingDelete.set(false);
    } finally {
      this.saving.set(false);
    }
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
    const account = this.account() as AccountDto;
    this.saving.set(true);
    try {
      await this.recordsApi.upsert(this.id, {
        type: 'adjustment',
        occurredOn: v.occurredOn,
        accountId: v.accountId,
        currency: account.currency,
        targetBalance: v.targetBalance,
        note: v.note.trim() || null,
        lines: [],
      });
      this.nav.leave('/accounts', $localize`:@@accounts.adjusted:Balance adjusted.`);
    } catch (error) {
      const unmatched = applyFieldErrors(problemOf(error), (field) => this.controlFor(field));
      if (unmatched.length) this.toast.show(unmatched.join(' '));
    } finally {
      this.saving.set(false);
    }
  }

  private controlFor(field: string): AbstractControl | undefined {
    return (this.form.controls as Record<string, AbstractControl>)[field];
  }
}
