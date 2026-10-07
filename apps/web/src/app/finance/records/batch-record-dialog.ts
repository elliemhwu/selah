import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { isRecordCurrencyAllowed } from '@selah/shared-utils';
import { map } from 'rxjs';
import { MoneyPipe } from '../../core/money.pipe';
import { applyFieldErrors, problemOf } from '../../core/problem';
import { TODAY } from '../../core/today';
import { Toast } from '../../ui/toast';
import { AccountsApi, type ChecklistItemDto, type RecordDto, RecordsApi } from '../data/finance-api';
import { toInputAmount } from './budget-item-options';
import { errorText, MONEY_PATTERN, positiveAmount } from './form-errors';

export interface BatchRecordDialogData {
  items: ChecklistItemDto[];
}

/**
 * Checklist batch create (requirements §2): one record per selected plan item,
 * pre-filled with the planned amount, saved all or nothing.
 */
@Component({
  selector: 'selah-batch-record-dialog',
  imports: [ReactiveFormsModule, MoneyPipe],
  templateUrl: './batch-record-dialog.html',
  styleUrl: './batch-record-dialog.scss',
})
export class BatchRecordDialog {
  protected readonly items = inject<BatchRecordDialogData>(DIALOG_DATA).items;
  private readonly dialogRef = inject<DialogRef<RecordDto[], BatchRecordDialog>>(DialogRef);
  private readonly recordsApi = inject(RecordsApi);
  private readonly toast = inject(Toast);
  private readonly fb = inject(NonNullableFormBuilder);
  /** One id per row, kept across retries (ADR 0017). */
  private readonly ids = this.items.map(() => crypto.randomUUID());

  protected readonly form = this.fb.group({
    occurredOn: [inject(TODAY)(), Validators.required],
    accountId: ['', Validators.required],
    rows: this.fb.array(
      this.items.map((item) =>
        this.fb.group({
          include: true,
          amount: [toInputAmount(item.planned), [Validators.required, Validators.pattern(MONEY_PATTERN), positiveAmount]],
          note: ['', Validators.maxLength(500)],
        }),
      ),
    ),
  });
  private readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  private readonly allAccounts = inject(AccountsApi).list();
  /** Planned amounts are TWD, so only accounts that take TWD records (ADR 0016). */
  protected readonly accounts = computed(() =>
    this.allAccounts.value().filter((a) => isRecordCurrencyAllowed('TWD', a.currency)),
  );
  protected readonly includedCount = computed(() => this.value().rows.filter((r) => r.include).length);
  protected readonly saving = signal(false);
  protected readonly errorText = errorText;

  constructor() {
    effect(() => {
      const first = this.accounts()[0];
      if (first && !this.form.controls.accountId.value) this.form.controls.accountId.setValue(first.id);
    });
  }

  protected cancel(): void {
    this.dialogRef.close();
  }

  async save(): Promise<void> {
    const rows = this.form.controls.rows.controls;
    const included = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.controls.include.value);
    const invalid =
      this.form.controls.occurredOn.invalid ||
      this.form.controls.accountId.invalid ||
      included.some(({ row }) => row.invalid);
    if (invalid || included.length === 0) {
      this.form.markAllAsTouched();
      return;
    }

    const { occurredOn, accountId } = this.form.getRawValue();
    this.saving.set(true);
    try {
      const saved = await this.recordsApi.upsertBatch(
        included.map(({ row, index }) => {
          const item = this.items[index];
          return {
            id: this.ids[index],
            type: item.section === 'income' ? 'income' : 'expense',
            occurredOn,
            accountId,
            currency: 'TWD',
            note: row.controls.note.value.trim() || null,
            lines: [{ amount: row.controls.amount.value, budgetItemId: item.budgetItemId }],
          };
        }),
      );
      this.dialogRef.close(saved);
    } catch (error) {
      const unmatched = applyFieldErrors(problemOf(error), (field) => this.controlFor(field, included.map((i) => i.index)));
      if (unmatched.length) this.toast.show(unmatched.join(' '));
    } finally {
      this.saving.set(false);
    }
  }

  /** Maps `records.2.lines.0.amount` back to the row that was sent third. */
  private controlFor(field: string, sentRows: number[]): AbstractControl | undefined {
    const match = /^records\.(\d+)\.(.+)$/.exec(field);
    if (!match) return undefined;
    const [, position, rest] = match;
    if (rest === 'occurredOn' || rest === 'accountId') return this.form.controls[rest];
    const row = this.form.controls.rows.at(sentRows[Number(position)]);
    if (!row) return undefined;
    if (rest === 'note') return row.controls.note;
    if (/^lines\.0\.(amount|twdAmount)$/.test(rest)) return row.controls.amount;
    return undefined;
  }
}
