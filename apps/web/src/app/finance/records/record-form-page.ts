import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CURRENCIES, type Currency } from '@selah/shared-types';
import {
  formatMoney,
  isRecordCurrencyAllowed,
  parseMoney,
  parseRate,
  sumCents,
  toTwd,
  yearMonthOf,
} from '@selah/shared-utils';
import { map } from 'rxjs';
import { MoneyPipe } from '../../core/money.pipe';
import { applyFieldErrors, problemOf } from '../../core/problem';
import { TODAY } from '../../core/today';
import { FormNavigation } from '../../ui/form-navigation';
import { Toast } from '../../ui/toast';
import { AccountsApi, CategoriesApi, PlanApi, type RecordDto, RecordsApi } from '../data/finance-api';
import { budgetItemGroups, toInputAmount } from './budget-item-options';
import { errorText, MONEY_PATTERN, positiveAmount, RATE_PATTERN } from './form-errors';

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * An income or expense record with one or more lines (requirements §2, ADR 0013).
 * Routes: `/records/new?type=income&item=<budget item id>&amount=1200.00`
 * (every parameter optional, e.g. from a checklist item) and `/records/:id`
 * to edit; transfers and adjustments open in their own forms (ADR 0022).
 */
@Component({
  selector: 'selah-record-form-page',
  host: { class: 'form-page' },
  imports: [MoneyPipe, NgTemplateOutlet, ReactiveFormsModule],
  templateUrl: './record-form-page.html',
  styleUrl: './record-form-page.scss',
})
export class RecordFormPage {
  private readonly route = inject(ActivatedRoute).snapshot;
  private readonly params = this.route.queryParamMap;
  private readonly router = inject(Router);
  private readonly nav = inject(FormNavigation);
  private readonly recordsApi = inject(RecordsApi);
  private readonly toast = inject(Toast);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly today = inject(TODAY)();

  /** The record being edited; undefined for a new one. */
  private readonly editId = this.route.paramMap.get('id') ?? undefined;
  protected readonly editing = !!this.editId;
  /** Generated once, so saving again after an error never duplicates the record (ADR 0017). */
  private readonly id = this.editId ?? crypto.randomUUID();
  private readonly loaded = this.recordsApi.get(() => this.editId);
  protected readonly loading = computed(() => this.editing && this.loaded.isLoading());
  protected readonly notFound = computed(() => this.editing && !!this.loaded.error());

  protected readonly form = this.fb.group({
    type: (this.params.get('type') === 'income' ? 'income' : 'expense') as 'income' | 'expense',
    occurredOn: [this.today, Validators.required],
    occurredAt: '',
    accountId: ['', Validators.required],
    currency: 'TWD' as Currency,
    fxRate: ['', Validators.pattern(RATE_PATTERN)],
    note: ['', Validators.maxLength(500)],
    lines: this.fb.array([this.line(null, toInputAmount(this.params.get('amount') ?? ''), this.params.get('item') ?? '')]),
  });
  protected readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
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
  protected readonly confirmingDelete = signal(false);
  protected readonly errorText = errorText;

  private readonly account = computed(() => this.accounts.value().find((a) => a.id === this.value().accountId));
  /** A record's currency must fit its account (ADR 0016). */
  protected readonly currencies = computed(() => {
    const account = this.account();
    return account ? CURRENCIES.filter((c) => isRecordCurrencyAllowed(c, account.currency)) : (['TWD'] as Currency[]);
  });
  protected readonly foreign = computed(() => this.value().currency !== 'TWD');
  protected readonly split = computed(() => this.value().lines.length > 1);
  /** The record's total, from the lines that are valid amounts. */
  protected readonly total = computed(() =>
    formatMoney(sumCents(this.value().lines.filter((l) => MONEY_PATTERN.test(l.amount)).map((l) => parseMoney(l.amount)))),
  );
  protected readonly twdPreview = computed(() => {
    const { fxRate } = this.value();
    if (!this.foreign() || !RATE_PATTERN.test(fxRate) || !/[1-9]/.test(fxRate)) return null;
    return formatMoney(toTwd(parseMoney(this.total()), parseRate(fxRate)));
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
    // Editing: fill the form once the record arrives; transfers and adjustments have their own forms.
    effect(() => {
      if (!this.loaded.hasValue() || this.form.dirty) return;
      const record = this.loaded.value();
      if (record.type === 'transfer' || record.type === 'adjustment') {
        void this.router.navigate(['/accounts', record.type === 'transfer' ? 'transfer' : 'adjust', record.id], {
          replaceUrl: true,
        });
        return;
      }
      this.fill(record);
    });
    // Default to the first account once accounts load.
    effect(() => {
      const first = this.accounts.value()[0];
      if (first && !this.editing && !this.form.controls.accountId.value) this.form.controls.accountId.setValue(first.id);
    });
    // Keep the currency valid for the account.
    effect(() => {
      const allowed = this.currencies();
      const currency = this.form.controls.currency;
      const account = this.account();
      if (account && !allowed.includes(currency.value)) currency.setValue(account.currency);
    });
    // Drop budget items that don't fit the type, once the plan is known.
    effect(() => {
      const groups = this.itemGroups();
      if (!this.plan.hasValue()) return;
      for (const line of this.form.controls.lines.controls) {
        const item = line.controls.budgetItemId;
        if (item.value && !groups.some((g) => g.items.some((i) => i.id === item.value))) item.setValue('');
      }
    });
    // Pre-fill the rate with the last one used for the currency (requirements §2).
    this.form.controls.currency.valueChanges.pipe(takeUntilDestroyed()).subscribe((currency) => {
      const rate = this.rates.value().find((r) => r.currency === currency)?.rate ?? '';
      this.form.controls.fxRate.setValue(currency === 'TWD' ? '' : rate);
    });
  }

  protected addLine(): void {
    this.form.controls.lines.push(this.line(null, '', ''));
    this.form.markAsDirty();
  }

  protected removeLine(index: number): void {
    if (this.form.controls.lines.length > 1) this.form.controls.lines.removeAt(index);
    this.form.markAsDirty();
  }

  protected cancel(): void {
    this.nav.leave(this.editing ? '/records' : '/');
  }

  async save(): Promise<void> {
    const v = this.form.getRawValue();
    if (this.foreign() && !v.fxRate) this.form.controls.fxRate.setErrors({ required: true });
    if (this.form.invalid || this.loading() || this.notFound()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      await this.recordsApi.upsert(this.id, {
        type: v.type,
        occurredOn: v.occurredOn,
        occurredAt: v.occurredAt || null,
        accountId: v.accountId,
        currency: v.currency,
        note: v.note.trim() || null,
        lines: v.lines.map((line) => ({
          id: line.id,
          amount: line.amount,
          fxRate: this.foreign() ? v.fxRate : undefined,
          budgetItemId: line.budgetItemId || null,
          categoryId: line.categoryId || null,
          note: line.note.trim() || null,
        })),
      });
      this.nav.leave(this.editing ? '/records' : '/', $localize`:@@record.saved:Saved.`);
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
      await this.recordsApi.remove(this.editId);
      this.nav.leave('/records', $localize`:@@record.deleted:Entry deleted.`);
    } catch (error) {
      this.toast.show(problemOf(error).message);
      this.confirmingDelete.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  private fill(record: RecordDto): void {
    const lines = this.form.controls.lines;
    lines.clear({ emitEvent: false });
    for (const l of record.lines) {
      lines.push(this.line(l.id, toInputAmount(l.amount), l.budgetItemId ?? '', l.categoryId ?? '', l.note ?? ''), {
        emitEvent: false,
      });
    }
    this.form.patchValue({
      type: record.type as 'income' | 'expense',
      occurredOn: record.occurredOn,
      occurredAt: record.occurredAt ?? '',
      accountId: record.accountId,
      currency: record.currency,
      fxRate: record.lines[0]?.fxRate ?? '',
      note: record.note ?? '',
    });
  }

  /** A line keeps its id across edits (ADR 0017); a new line gets one now, so retries match. */
  private line(id: string | null, amount: string, budgetItemId: string, categoryId = '', note = '') {
    return this.fb.group({
      id: id ?? crypto.randomUUID(),
      amount: [amount, [Validators.required, Validators.pattern(MONEY_PATTERN), positiveAmount]],
      budgetItemId,
      categoryId,
      note: [note, Validators.maxLength(500)],
    });
  }

  /** The form control for an API field path, e.g. `lines.1.amount` (ADR 0017). */
  private controlFor(field: string): AbstractControl | undefined {
    const match = /^lines\.(\d+)\.(\w+)$/.exec(field);
    if (match) {
      const line = this.form.controls.lines.at(Number(match[1]));
      if (!line) return undefined;
      if (match[2] === 'fxRate') return this.form.controls.fxRate;
      const name = match[2] === 'twdAmount' ? 'amount' : match[2];
      return (line.controls as Record<string, AbstractControl>)[name];
    }
    return (this.form.controls as Record<string, AbstractControl>)[field];
  }
}
