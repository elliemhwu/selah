import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map } from 'rxjs';
import { MoneyPipe } from '../../core/money.pipe';
import { applyFieldErrors, problemOf } from '../../core/problem';
import { TODAY } from '../../core/today';
import { Toast } from '../../ui/toast';
import { type AccountDto, type RecordDto, RecordsApi } from '../data/finance-api';
import { errorText, SIGNED_MONEY_PATTERN } from '../records/form-errors';

export interface AdjustDialogData {
  accounts: AccountDto[];
  accountId?: string;
}

/**
 * Sets an account to its actual balance (ADR 0014). Only the target is
 * stored; the difference is calculated, so later edits keep it exact.
 */
@Component({
  selector: 'selah-adjust-dialog',
  imports: [ReactiveFormsModule, MoneyPipe],
  templateUrl: './adjust-dialog.html',
})
export class AdjustDialog {
  private readonly data = inject<AdjustDialogData>(DIALOG_DATA);
  protected readonly accounts = this.data.accounts;
  private readonly dialogRef = inject<DialogRef<RecordDto, AdjustDialog>>(DialogRef);
  private readonly recordsApi = inject(RecordsApi);
  private readonly toast = inject(Toast);
  private readonly id = crypto.randomUUID();

  protected readonly form = inject(NonNullableFormBuilder).group({
    accountId: [this.data.accountId ?? this.accounts[0]?.id ?? '', Validators.required],
    occurredOn: [inject(TODAY)(), Validators.required],
    targetBalance: ['', [Validators.required, Validators.pattern(SIGNED_MONEY_PATTERN)]],
    note: ['', Validators.maxLength(500)],
  });
  private readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  protected readonly account = computed(() => this.accounts.find((a) => a.id === this.value().accountId));
  protected readonly saving = signal(false);
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
    const account = this.account() as AccountDto;
    this.saving.set(true);
    try {
      const record = await this.recordsApi.upsert(this.id, {
        type: 'adjustment',
        occurredOn: v.occurredOn,
        accountId: v.accountId,
        currency: account.currency,
        targetBalance: v.targetBalance,
        note: v.note.trim() || null,
        lines: [],
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
    return (this.form.controls as Record<string, AbstractControl>)[field];
  }
}
