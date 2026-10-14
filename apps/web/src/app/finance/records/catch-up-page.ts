import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { addDays, formatMoney, parseMoney, sumCents, yearMonthOf } from '@selah/shared-utils';
import { map } from 'rxjs';
import { MoneyPipe } from '../../core/money.pipe';
import { applyFieldErrors, problemOf } from '../../core/problem';
import { TODAY } from '../../core/today';
import { FormNavigation } from '../../ui/form-navigation';
import { Icon } from '../../ui/icon';
import { Toast } from '../../ui/toast';
import { categoryTree } from '../categories/category-tree';
import { AccountsApi, CategoriesApi, PlanApi, RecordsApi } from '../data/finance-api';
import { budgetItemGroups } from './budget-item-options';
import { errorText, MONEY_PATTERN, positiveAmount, RATE_PATTERN } from './form-errors';

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
type EntryType = 'income' | 'expense';

/**
 * Batch entry for catching up on past days (requirements §2), one day at a
 * time: the day's income and expenses on one account, saved all or nothing,
 * then on to the next day. Rows left without an amount are skipped.
 * Route: `/records/catch-up?date=YYYY-MM-DD&account=<id>` (both optional;
 * the day defaults to yesterday) (ADR 0022).
 */
@Component({
  selector: 'selah-catch-up-page',
  host: { class: 'form-page' },
  imports: [DatePipe, Icon, MoneyPipe, ReactiveFormsModule],
  templateUrl: './catch-up-page.html',
  styleUrl: './catch-up-page.scss',
})
export class CatchUpPage {
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;
  private readonly nav = inject(FormNavigation);
  private readonly recordsApi = inject(RecordsApi);
  private readonly toast = inject(Toast);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly today = inject(TODAY)();

  protected readonly form = this.fb.group({
    occurredOn: [this.startDate(), Validators.required],
    accountId: ['', Validators.required],
    fxRate: ['', Validators.pattern(RATE_PATTERN)],
    rows: this.fb.array([this.row()]),
  });
  private readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  /** The day the form works with, falling back to today while the field holds no real date. */
  protected readonly date = computed(() => {
    const date = this.value().occurredOn;
    return LOCAL_DATE.test(date) ? date : this.today;
  });
  private readonly month = computed(() => yearMonthOf(this.date()));
  protected readonly accounts = inject(AccountsApi).list();
  protected readonly categories = inject(CategoriesApi).list();
  private readonly rates = this.recordsApi.lastUsedRates();
  private readonly plan = inject(PlanApi).active(this.month);
  /** What is already recorded that day, so nothing is entered twice. */
  protected readonly dayRecords = this.recordsApi.list(() => ({ from: this.date(), to: this.date() }));

  /** Guarded: a resource's value() throws while it is in an error state. */
  protected readonly accountList = computed(() => (this.accounts.hasValue() ? this.accounts.value() : []));
  private readonly account = computed(() => this.accountList().find((a) => a.id === this.value().accountId));
  /** Entries take the account's currency, so its balance moves by what was typed (ADR 0016). */
  protected readonly currency = computed(() => this.account()?.currency ?? 'TWD');
  protected readonly foreign = computed(() => this.currency() !== 'TWD');
  protected readonly itemGroups = computed(() => {
    const items = this.plan.hasValue() ? this.plan.value().items : [];
    return { income: budgetItemGroups(items, 'income'), expense: budgetItemGroups(items, 'expense') };
  });
  protected readonly categoryOptions = computed(() => (this.categories.hasValue() ? categoryTree(this.categories.value()) : []));
  /** Rows with an amount are the ones that get saved. */
  protected readonly filledCount = computed(() => this.value().rows.filter((r) => r.amount.trim()).length);
  protected readonly recorded = computed(() => {
    const records = this.dayRecords.hasValue() ? this.dayRecords.value() : [];
    const spent = records.filter((r) => r.type === 'expense').flatMap((r) => r.lines.map((l) => parseMoney(l.twdAmount)));
    return { count: records.length, spent: formatMoney(sumCents(spent)) };
  });
  protected readonly canGoForward = computed(() => this.date() < this.today);

  protected readonly saving = signal(false);
  protected readonly errorText = errorText;

  constructor() {
    // Default to the account from the route, else the first one.
    effect(() => {
      const list = this.accountList();
      const control = this.form.controls.accountId;
      if (list.length === 0 || control.value) return;
      control.setValue((list.find((a) => a.id === this.query.get('account')) ?? list[0]).id);
    });
    // A foreign account needs the day's rate; pre-fill the last one used (requirements §2).
    effect(() => {
      const currency = this.currency();
      const rate = (this.rates.hasValue() ? this.rates.value() : []).find((r) => r.currency === currency)?.rate ?? '';
      const control = this.form.controls.fxRate;
      if (!control.dirty) control.setValue(currency === 'TWD' ? '' : rate);
    });
  }

  protected addRow(): void {
    const last = this.form.controls.rows.at(-1)?.controls.type.value ?? 'expense';
    this.form.controls.rows.push(this.row(last));
  }

  protected removeRow(index: number): void {
    const rows = this.form.controls.rows;
    if (rows.length > 1) rows.removeAt(index);
    else rows.setControl(0, this.row());
  }

  /** A budget item belongs to one side; switching the type drops one that no longer fits. */
  protected typeChanged(index: number): void {
    const row = this.form.controls.rows.at(index).controls;
    const groups = this.itemGroups()[row.type.value];
    if (!groups.some((g) => g.items.some((i) => i.id === row.budgetItemId.value))) row.budgetItemId.setValue('');
  }

  protected shiftDay(days: number): void {
    this.form.controls.occurredOn.setValue(addDays(this.date(), days));
  }

  protected cancel(): void {
    this.nav.leave('/records');
  }

  /** Saves the day and leaves. */
  async save(): Promise<void> {
    const saved = await this.saveDay();
    if (saved !== null) this.nav.leave('/records', saved > 0 ? savedMessage(saved) : undefined);
  }

  /** Saves the day, then starts the next one with an empty row. */
  async saveAndNextDay(): Promise<void> {
    const saved = await this.saveDay();
    if (saved === null) return;
    if (saved > 0) this.toast.show(savedMessage(saved));
    const rows = this.form.controls.rows;
    rows.clear();
    rows.push(this.row());
    this.form.controls.occurredOn.setValue(addDays(this.date(), 1));
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  /** The number of entries saved, or null when nothing could be saved. */
  private async saveDay(): Promise<number | null> {
    const { occurredOn, accountId, fxRate } = this.form.controls;
    const rows = this.form.controls.rows.controls;
    const filled = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.controls.amount.value.trim());
    if (this.foreign() && filled.length > 0 && !fxRate.value) fxRate.setErrors({ required: true });
    const invalid = occurredOn.invalid || accountId.invalid || fxRate.invalid || filled.some(({ row }) => row.invalid);
    if (invalid) {
      this.form.markAllAsTouched();
      return null;
    }
    if (filled.length === 0) return 0;

    const currency = this.currency();
    this.saving.set(true);
    try {
      await this.recordsApi.upsertBatch(
        filled.map(({ row }) => {
          const r = row.getRawValue();
          return {
            id: r.id,
            type: r.type,
            occurredOn: occurredOn.value,
            accountId: accountId.value,
            currency,
            note: r.note.trim() || null,
            lines: [
              {
                amount: r.amount.trim(),
                fxRate: this.foreign() ? fxRate.value : undefined,
                budgetItemId: r.budgetItemId || null,
                categoryId: r.categoryId || null,
              },
            ],
          };
        }),
      );
      return filled.length;
    } catch (error) {
      const sent = filled.map(({ index }) => index);
      const unmatched = applyFieldErrors(problemOf(error), (field) => this.controlFor(field, sent));
      if (unmatched.length) this.toast.show(unmatched.join(' '));
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  /** An entry's id is generated with its row, so a retry never duplicates it (ADR 0017). */
  private row(type: EntryType = 'expense') {
    return this.fb.group({
      id: crypto.randomUUID(),
      type,
      amount: ['', [Validators.pattern(MONEY_PATTERN), positiveAmount]],
      budgetItemId: '',
      categoryId: '',
      note: ['', Validators.maxLength(500)],
    });
  }

  /** The day's default: the route's date, else yesterday. */
  private startDate(): string {
    const date = this.query.get('date');
    return date && LOCAL_DATE.test(date) ? date : addDays(this.today, -1);
  }

  /** Maps `records.2.lines.0.amount` back to the row that was sent third. */
  private controlFor(field: string, sentRows: number[]): AbstractControl | undefined {
    const match = /^records\.(\d+)\.(.+)$/.exec(field);
    if (!match) return undefined;
    const [, position, rest] = match;
    if (rest === 'occurredOn' || rest === 'accountId') return this.form.controls[rest];
    if (rest === 'lines.0.fxRate') return this.form.controls.fxRate;
    const row = this.form.controls.rows.at(sentRows[Number(position)]);
    if (!row) return undefined;
    const name = rest.replace(/^lines\.0\./, '');
    if (name === 'twdAmount') return row.controls.amount;
    return (row.controls as Record<string, AbstractControl>)[name];
  }
}

function savedMessage(count: number): string {
  return $localize`:@@batch.saved:Saved ${count}:count: entries.`;
}
