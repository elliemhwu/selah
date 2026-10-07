import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map } from 'rxjs';
import { applyFieldErrors, problemOf } from '../../core/problem';
import { TODAY } from '../../core/today';
import { Toast } from '../../ui/toast';
import { type AccountDto, type RecordDto, RecordsApi } from '../data/finance-api';
import { errorText, MONEY_PATTERN, positiveAmount, RATE_PATTERN } from '../records/form-errors';

export interface TransferDialogData {
  accounts: AccountDto[];
  /** Pre-selects the account money leaves. */
  fromAccountId?: string;
}

/**
 * Moves money between two accounts (requirements §2). The amount sent and the
 * amount received are both stored, so an exchange keeps its exact rate.
 */
@Component({
  selector: 'selah-transfer-dialog',
  imports: [ReactiveFormsModule],
  templateUrl: './transfer-dialog.html',
})
export class TransferDialog {
  private readonly data = inject<TransferDialogData>(DIALOG_DATA);
  protected readonly accounts = this.data.accounts;
  private readonly dialogRef = inject<DialogRef<RecordDto, TransferDialog>>(DialogRef);
  private readonly recordsApi = inject(RecordsApi);
  private readonly toast = inject(Toast);
  private readonly id = crypto.randomUUID();
  private readonly rates = this.recordsApi.lastUsedRates();

  protected readonly form = inject(NonNullableFormBuilder).group({
    fromAccountId: [this.data.fromAccountId ?? this.accounts[0]?.id ?? '', Validators.required],
    toAccountId: [this.accounts.find((a) => a.id !== (this.data.fromAccountId ?? this.accounts[0]?.id))?.id ?? '', Validators.required],
    occurredOn: [inject(TODAY)(), Validators.required],
    amount: ['', [Validators.required, Validators.pattern(MONEY_PATTERN), positiveAmount]],
    counterAmount: ['', [Validators.pattern(MONEY_PATTERN), positiveAmount]],
    fxRate: ['', Validators.pattern(RATE_PATTERN)],
    note: ['', Validators.maxLength(500)],
  });
  private readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  protected readonly from = computed(() => this.accounts.find((a) => a.id === this.value().fromAccountId));
  protected readonly to = computed(() => this.accounts.find((a) => a.id === this.value().toAccountId));
  /** Different currencies: the amount received is entered separately. */
  protected readonly exchange = computed(() => !!this.from() && !!this.to() && this.from()?.currency !== this.to()?.currency);
  /** A foreign-currency line needs its TWD value (ADR 0006). */
  protected readonly needsRate = computed(() => (this.from()?.currency ?? 'TWD') !== 'TWD');
  protected readonly saving = signal(false);
  protected readonly errorText = errorText;

  constructor() {
    effect(() => {
      const currency = this.from()?.currency;
      const rate = this.rates.value().find((r) => r.currency === currency)?.rate;
      const control = this.form.controls.fxRate;
      if (currency && currency !== 'TWD' && rate && !control.value) control.setValue(rate);
    });
  }

  protected cancel(): void {
    this.dialogRef.close();
  }

  async save(): Promise<void> {
    const v = this.form.getRawValue();
    if (v.fromAccountId && v.fromAccountId === v.toAccountId) {
      this.form.controls.toAccountId.setErrors({ server: $localize`:@@transfer.sameAccount:Choose two different accounts.` });
    }
    if (this.exchange() && !v.counterAmount) this.form.controls.counterAmount.setErrors({ required: true });
    if (this.needsRate() && !v.fxRate) this.form.controls.fxRate.setErrors({ required: true });
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const from = this.from() as AccountDto;
    this.saving.set(true);
    try {
      const record = await this.recordsApi.upsert(this.id, {
        type: 'transfer',
        occurredOn: v.occurredOn,
        accountId: v.fromAccountId,
        currency: from.currency,
        counterAccountId: v.toAccountId,
        counterAmount: this.exchange() ? v.counterAmount : v.amount,
        note: v.note.trim() || null,
        lines: [{ amount: v.amount, fxRate: this.needsRate() ? v.fxRate : undefined }],
      });
      this.dialogRef.close(record);
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
