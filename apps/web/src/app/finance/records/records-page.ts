import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { type RecordType, RECORD_TYPES, type YearMonth } from '@selah/shared-types';
import {
  endOfMonth,
  formatMoney,
  nextYearMonth,
  parseMoney,
  previousYearMonth,
  sumCents,
  yearMonthOf,
} from '@selah/shared-utils';
import { MoneyPipe } from '../../core/money.pipe';
import { TODAY } from '../../core/today';
import { Icon } from '../../ui/icon';
import { AccountsApi, CategoriesApi, PlanApi, type RecordDto, type RecordQuery, RecordsApi } from '../data/finance-api';

const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  income: $localize`:@@record.type.income:Income`,
  expense: $localize`:@@record.type.expense:Expense`,
  transfer: $localize`:@@record.type.transfer:Transfer`,
  adjustment: $localize`:@@record.type.adjustment:Adjustment`,
};

interface Filters {
  accountId: string;
  categoryId: string;
  budgetItemId: string;
  type: RecordType | '';
}

/**
 * Records (requirements §4): a month's records by day, filtered by account,
 * category, budget item and type. Month and filters live in the query string,
 * so a reload or the back button keeps them.
 */
@Component({
  selector: 'selah-records-page',
  imports: [DatePipe, Icon, MoneyPipe, RouterLink],
  templateUrl: './records-page.html',
  styleUrl: './records-page.scss',
})
export class RecordsPage {
  private readonly router = inject(Router);
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;
  private readonly todayMonth = yearMonthOf(inject(TODAY)());

  protected readonly month = signal<YearMonth>(this.monthFromQuery());
  protected readonly filters = signal<Filters>({
    accountId: this.query.get('account') ?? '',
    categoryId: this.query.get('category') ?? '',
    budgetItemId: this.query.get('item') ?? '',
    type: (RECORD_TYPES as readonly string[]).includes(this.query.get('type') ?? '') ? (this.query.get('type') as RecordType) : '',
  });
  protected readonly showFilters = signal(Object.values(this.filters()).some(Boolean));
  protected readonly typeOptions = RECORD_TYPES.map((type) => ({ type, label: RECORD_TYPE_LABELS[type] }));

  private readonly request = computed((): RecordQuery => {
    const month = this.month();
    const f = this.filters();
    return {
      from: `${month}-01`,
      to: endOfMonth(`${month}-01`),
      accountId: f.accountId || undefined,
      categoryId: f.categoryId || undefined,
      budgetItemId: f.budgetItemId || undefined,
      type: f.type || undefined,
    };
  });
  protected readonly records = inject(RecordsApi).list(this.request);
  protected readonly accounts = inject(AccountsApi).list();
  protected readonly categories = inject(CategoriesApi).list();
  private readonly plan = inject(PlanApi).active(this.month);

  private readonly accountNames = computed(() => new Map(this.accounts.value().map((a) => [a.id, a.name])));
  private readonly categoryNames = computed(() => new Map(this.categories.value().map((c) => [c.id, c.name])));
  protected readonly planItems = computed(() => (this.plan.hasValue() ? this.plan.value().items : []));
  private readonly itemNames = computed(() => new Map(this.planItems().map((i) => [i.budgetItemId, i.name])));

  /** Records grouped by day, newest day first, as the API orders them. */
  protected readonly days = computed(() => {
    const groups: { date: string; records: RecordDto[] }[] = [];
    for (const record of this.records.value()) {
      const last = groups.at(-1);
      if (last?.date === record.occurredOn) last.records.push(record);
      else groups.push({ date: record.occurredOn, records: [record] });
    }
    return groups;
  });
  /** Spent and received this month in TWD, from the lines (reports total lines, requirements §2). */
  protected readonly totals = computed(() => {
    const sum = (type: RecordType) =>
      formatMoney(sumCents(this.records.value().filter((r) => r.type === type).flatMap((r) => r.lines.map((l) => parseMoney(l.twdAmount)))));
    return { spent: sum('expense'), received: sum('income') };
  });
  protected readonly filtered = computed(() => Object.values(this.filters()).some(Boolean));

  protected previousMonth(): void {
    this.setMonth(previousYearMonth(this.month()));
  }

  protected nextMonth(): void {
    this.setMonth(nextYearMonth(this.month()));
  }

  protected setFilter(name: keyof Filters, value: string): void {
    this.filters.set({ ...this.filters(), [name]: value });
    this.syncUrl();
  }

  protected clearFilters(): void {
    this.filters.set({ accountId: '', categoryId: '', budgetItemId: '', type: '' });
    this.syncUrl();
  }

  protected firstOfMonth(month: YearMonth): string {
    return `${month}-01`;
  }

  /** Where tapping a record goes: transfers and adjustments have their own forms (ADR 0022). */
  protected link(record: RecordDto): string[] {
    if (record.type === 'transfer') return ['/accounts/transfer', record.id];
    if (record.type === 'adjustment') return ['/accounts/adjust', record.id];
    return ['/records', record.id];
  }

  /** The line a reader recognises the record by. */
  protected title(record: RecordDto): string {
    const account = (id: string | null) => (id ? (this.accountNames().get(id) ?? '') : '');
    if (record.type === 'transfer') return `${account(record.accountId)} → ${account(record.counterAccountId)}`;
    if (record.type === 'adjustment') return $localize`:@@records.adjusted:${account(record.accountId)}:account: set to actual balance`;
    const names = record.lines.map(
      (l) =>
        (l.budgetItemId && this.itemNames().get(l.budgetItemId)) ||
        (l.categoryId && this.categoryNames().get(l.categoryId)) ||
        l.note ||
        '',
    );
    const first = names.find(Boolean) || record.note || RECORD_TYPE_LABELS[record.type];
    return record.lines.length > 1 ? $localize`:@@records.andMore:${first}:first: and ${record.lines.length - 1}:more: more` : first;
  }

  protected subtitle(record: RecordDto): string {
    const parts = [record.type === 'transfer' ? RECORD_TYPE_LABELS.transfer : (this.accountNames().get(record.accountId) ?? '')];
    if (record.occurredAt) parts.push(record.occurredAt);
    if (record.note && record.type !== 'income' && record.type !== 'expense') parts.push(record.note);
    return parts.filter(Boolean).join(' · ');
  }

  /** The record's amount in its own currency: the lines' total, or the target balance. */
  protected amount(record: RecordDto): string {
    if (record.type === 'adjustment') return record.targetBalance ?? '0.00';
    return formatMoney(sumCents(record.lines.map((l) => parseMoney(l.amount))));
  }

  private setMonth(month: YearMonth): void {
    this.month.set(month);
    this.syncUrl();
  }

  private syncUrl(): void {
    const f = this.filters();
    void this.router.navigate([], {
      queryParams: {
        month: this.month() === this.todayMonth ? null : this.month(),
        account: f.accountId || null,
        category: f.categoryId || null,
        item: f.budgetItemId || null,
        type: f.type || null,
      },
      replaceUrl: true,
    });
  }

  private monthFromQuery(): YearMonth {
    const asked = this.query.get('month');
    return asked && YEAR_MONTH.test(asked) ? asked : this.todayMonth;
  }
}
