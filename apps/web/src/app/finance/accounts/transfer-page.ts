import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { applyFieldErrors, problemOf } from '../../core/problem';
import { TODAY } from '../../core/today';
import { FormNavigation } from '../../ui/form-navigation';
import { Toast } from '../../ui/toast';
import { type AccountDto, AccountsApi, RecordsApi } from '../data/finance-api';
import { toInputAmount } from '../records/budget-item-options';
import { errorText, MONEY_PATTERN, positiveAmount, RATE_PATTERN } from '../records/form-errors';

/**
 * Moves money between two accounts (requirements §2). The amount sent and the
 * amount received are both stored, so an exchange keeps its exact rate.
 * Route: `/accounts/transfer?from=<account id>` (ADR 0022).
 */
@Component({
  selector: 'selah-transfer-page',
  host: { class: 'form-page' },
  imports: [ReactiveFormsModule],
  templateUrl: './transfer-page.html',
})
export class TransferPage {
  private readonly fromParam = inject(ActivatedRoute).snapshot.queryParamMap.get('from');
  private readonly nav = inject(FormNavigation);
  private readonly recordsApi = inject(RecordsApi);
  private readonly toast = inject(Toast);
  /** The transfer being edited, from `/accounts/transfer/:id`; undefined for a new one. */
  private readonly editId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? undefined;
  protected readonly editing = !!this.editId;
  private readonly id = this.editId ?? crypto.randomUUID();
  private readonly loaded = this.recordsApi.get(() => this.editId);
  private filled = false;
  protected readonly loading = computed(() => this.editing && this.loaded.isLoading());
  protected readonly notFound = computed(() => this.editing && !!this.loaded.error());
  protected readonly confirmingDelete = signal(false);
  private readonly rates = this.recordsApi.lastUsedRates();
  private readonly allAccounts = inject(AccountsApi).list();
  protected readonly accounts = computed(() => this.allAccounts.value());

  protected readonly form = inject(NonNullableFormBuilder).group({
    fromAccountId: ['', Validators.required],
    toAccountId: ['', Validators.required],
    occurredOn: [inject(TODAY)(), Validators.required],
    amount: ['', [Validators.required, Validators.pattern(MONEY_PATTERN), positiveAmount]],
    counterAmount: ['', [Validators.pattern(MONEY_PATTERN), positiveAmount]],
    fxRate: ['', Validators.pattern(RATE_PATTERN)],
    note: ['', Validators.maxLength(500)],
  });
  private readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  protected readonly from = computed(() => this.accounts().find((a) => a.id === this.value().fromAccountId));
  protected readonly to = computed(() => this.accounts().find((a) => a.id === this.value().toAccountId));
  /** Different currencies: the amount received is entered separately. */
  protected readonly exchange = computed(() => !!this.from() && !!this.to() && this.from()?.currency !== this.to()?.currency);
  /** A foreign-currency line needs its TWD value (ADR 0006). */
  protected readonly needsRate = computed(() => (this.from()?.currency ?? 'TWD') !== 'TWD');
  protected readonly saving = signal(false);
  protected readonly errorText = errorText;

  constructor() {
    // Editing: fill the form once the transfer arrives.
    effect(() => {
      if (this.filled || !this.loaded.hasValue()) return;
      const record = this.loaded.value();
      this.filled = true;
      this.form.patchValue({
        fromAccountId: record.accountId,
        toAccountId: record.counterAccountId ?? '',
        occurredOn: record.occurredOn,
        amount: toInputAmount(record.lines[0]?.amount ?? ''),
        counterAmount: toInputAmount(record.counterAmount ?? ''),
        fxRate: record.lines[0]?.fxRate ?? '',
        note: record.note ?? '',
      });
    });
    // Default the two accounts once they load: the one asked for, then the next one.
    effect(() => {
      const list = this.accounts();
      const { fromAccountId, toAccountId } = this.form.controls;
      if (list.length === 0 || fromAccountId.value) return;
      const from = list.find((a) => a.id === this.fromParam) ?? list[0];
      fromAccountId.setValue(from.id);
      if (!toAccountId.value) toAccountId.setValue(list.find((a) => a.id !== from.id)?.id ?? '');
    });
    // Pre-fill the last rate used for a foreign account (requirements §2).
    effect(() => {
      const currency = this.from()?.currency;
      const rate = this.rates.value().find((r) => r.currency === currency)?.rate;
      const control = this.form.controls.fxRate;
      if (currency && currency !== 'TWD' && rate && !control.value) control.setValue(rate);
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
    const v = this.form.getRawValue();
    if (v.fromAccountId && v.fromAccountId === v.toAccountId) {
      this.form.controls.toAccountId.setErrors({ server: $localize`:@@transfer.sameAccount:Choose two different accounts.` });
    }
    if (this.exchange() && !v.counterAmount) this.form.controls.counterAmount.setErrors({ required: true });
    if (this.needsRate() && !v.fxRate) this.form.controls.fxRate.setErrors({ required: true });
    if (this.form.invalid || this.loading() || this.notFound()) {
      this.form.markAllAsTouched();
      return;
    }
    const from = this.from() as AccountDto;
    this.saving.set(true);
    try {
      await this.recordsApi.upsert(this.id, {
        type: 'transfer',
        occurredOn: v.occurredOn,
        accountId: v.fromAccountId,
        currency: from.currency,
        counterAccountId: v.toAccountId,
        counterAmount: this.exchange() ? v.counterAmount : v.amount,
        note: v.note.trim() || null,
        lines: [{ amount: v.amount, fxRate: this.needsRate() ? v.fxRate : undefined }],
      });
      this.nav.leave('/accounts', $localize`:@@accounts.transferSaved:Transfer saved.`);
    } catch (error) {
      const unmatched = applyFieldErrors(problemOf(error), (field) => this.controlFor(field));
      if (unmatched.length) this.toast.show(unmatched.join(' '));
    } finally {
      this.saving.set(false);
    }
  }

  private controlFor(field: string): AbstractControl | undefined {
    const controls: Record<string, AbstractControl> = {
      accountId: this.form.controls.fromAccountId,
      counterAccountId: this.form.controls.toAccountId,
      counterAmount: this.exchange() ? this.form.controls.counterAmount : this.form.controls.amount,
      occurredOn: this.form.controls.occurredOn,
      note: this.form.controls.note,
      'lines.0.amount': this.form.controls.amount,
      'lines.0.twdAmount': this.form.controls.amount,
      'lines.0.fxRate': this.form.controls.fxRate,
    };
    return controls[field];
  }
}
