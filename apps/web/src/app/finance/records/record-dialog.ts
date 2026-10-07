import { Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { CURRENCIES, type Currency } from '@selah/shared-types';
import { formatMoney, isRecordCurrencyAllowed, parseMoney, parseRate, toTwd, yearMonthOf } from '@selah/shared-utils';
import { map } from 'rxjs';
import { MoneyPipe } from '../../core/money.pipe';
import { applyFieldErrors, problemOf } from '../../core/problem';
import { TODAY } from '../../core/today';
import { Toast } from '../../ui/toast';
import { AccountsApi, CategoriesApi, PlanApi, type RecordDto, RecordsApi } from '../data/finance-api';
import { budgetItemGroups, toInputAmount } from './budget-item-options';
import { errorText, MONEY_PATTERN, positiveAmount, RATE_PATTERN } from './form-errors';

/** What a record starts with, e.g. from a checklist item (requirements §2). */
export interface RecordDialogData {
  type?: 'income' | 'expense';
  budgetItemId?: string | null;
  amount?: string | null;
}

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The quick record form: one income or expense line. */
@Component({
  selector: 'selah-record-dialog',
  imports: [ReactiveFormsModule, MoneyPipe],
  templateUrl: './record-dialog.html',
  styleUrl: './record-dialog.scss',
})
export class RecordDialog {
  private readonly data: RecordDialogData = inject<RecordDialogData | null>(DIALOG_DATA, { optional: true }) ?? {};
  private readonly dialogRef = inject<DialogRef<RecordDto, RecordDialog>>(DialogRef);
  private readonly recordsApi = inject(RecordsApi);
  private readonly toast = inject(Toast);
  /** Generated once, so saving again after an error never duplicates the record (ADR 0017). */
  private readonly id = crypto.randomUUID();
  private readonly today = inject(TODAY)();

  protected readonly form = inject(NonNullableFormBuilder).group({
    type: this.data.type ?? ('expense' as 'income' | 'expense'),
    occurredOn: [this.today, Validators.required],
    accountId: ['', Validators.required],
    currency: 'TWD' as Currency,
    amount: [
      this.data.amount ? toInputAmount(this.data.amount) : '',
      [Validators.required, Validators.pattern(MONEY_PATTERN), positiveAmount],
    ],
    fxRate: ['', Validators.pattern(RATE_PATTERN)],
    budgetItemId: this.data.budgetItemId ?? '',
    categoryId: '',
    note: ['', Validators.maxLength(500)],
  });
  private readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  protected readonly accounts = inject(AccountsApi).list();
  protected readonly categories = inject(CategoriesApi).list();
  private readonly rates = this.recordsApi.lastUsedRates();
  /** A computed, so the plan is only fetched again when the month changes. */
  private readonly month = computed(() => {
    const date = this.value().occurredOn;
    return yearMonthOf(LOCAL_DATE.test(date) ? date : this.today);
  });
  private readonly plan = inject(PlanApi).active(this.month);

  protected readonly saving = signal(false);
  protected readonly errorText = errorText;

  private readonly account = computed(() => this.accounts.value().find((a) => a.id === this.value().accountId));
  /** A record's currency must fit its account (ADR 0016). */
  protected readonly currencies = computed(() => {
    const account = this.account();
    return account ? CURRENCIES.filter((c) => isRecordCurrencyAllowed(c, account.currency)) : (['TWD'] as Currency[]);
  });
  protected readonly foreign = computed(() => this.value().currency !== 'TWD');
  protected readonly twdPreview = computed(() => {
    const { amount, fxRate } = this.value();
    if (!this.foreign() || !MONEY_PATTERN.test(amount) || !RATE_PATTERN.test(fxRate)) return null;
    return formatMoney(toTwd(parseMoney(amount), parseRate(fxRate)));
  });
  protected readonly itemGroups = computed(() =>
    this.plan.hasValue() ? budgetItemGroups(this.plan.value().items, this.value().type) : [],
  );
  protected readonly noPlan = computed(() => this.plan.status() === 'error');
  protected readonly categoryOptions = computed(() => {
    const list = this.categories.value();
    const parents = new Map(list.map((c) => [c.id, c.parentId]));
    const depth = (id: string) => {
      let d = 0;
      for (let p = parents.get(id); p && d < list.length; p = parents.get(p)) d++;
      return d;
    };
    return list.map((c) => ({ id: c.id, name: c.name, depth: depth(c.id) }));
  });

  constructor() {
    // Default to the first account once accounts load.
    effect(() => {
      const first = this.accounts.value()[0];
      if (first && !this.form.controls.accountId.value) this.form.controls.accountId.setValue(first.id);
    });
    // Keep the currency valid for the account.
    effect(() => {
      const allowed = this.currencies();
      const currency = this.form.controls.currency;
      if (!allowed.includes(currency.value)) currency.setValue(this.account()?.currency ?? 'TWD');
    });
    // Drop a budget item that doesn't fit the type, once the plan is known.
    effect(() => {
      const groups = this.itemGroups();
      const item = this.form.controls.budgetItemId;
      if (this.plan.hasValue() && item.value && !groups.some((g) => g.items.some((i) => i.id === item.value))) {
        item.setValue('');
      }
    });
    // Pre-fill the rate with the last one used for the currency (requirements §2).
    this.form.controls.currency.valueChanges.pipe(takeUntilDestroyed()).subscribe((currency) => {
      const rate = this.rates.value().find((r) => r.currency === currency)?.rate ?? '';
      this.form.controls.fxRate.setValue(currency === 'TWD' ? '' : rate);
    });
  }

  protected cancel(): void {
    this.dialogRef.close();
  }

  async save(): Promise<void> {
    const v = this.form.getRawValue();
    if (this.foreign() && !v.fxRate) this.form.controls.fxRate.setErrors({ required: true });
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const record = await this.recordsApi.upsert(this.id, {
        type: v.type,
        occurredOn: v.occurredOn,
        accountId: v.accountId,
        currency: v.currency,
        note: v.note.trim() || null,
        lines: [
          {
            amount: v.amount,
            fxRate: this.foreign() ? v.fxRate : undefined,
            budgetItemId: v.budgetItemId || null,
            categoryId: v.categoryId || null,
          },
        ],
      });
      this.dialogRef.close(record);
    } catch (error) {
      const unmatched = applyFieldErrors(problemOf(error), (field) => this.controlFor(field));
      if (unmatched.length) this.toast.show(unmatched.join(' '));
    } finally {
      this.saving.set(false);
    }
  }

  /** The form control for an API field path, e.g. `lines.0.amount` (ADR 0017). */
  private controlFor(field: string): AbstractControl | undefined {
    const name = field.replace(/^lines\.0\./, '').replace(/^twdAmount$/, 'amount');
    return (this.form.controls as Record<string, AbstractControl>)[name];
  }
}
