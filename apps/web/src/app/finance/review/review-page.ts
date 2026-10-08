import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Section, YearMonth } from '@selah/shared-types';
import { endOfMonth, nextYearMonth, previousYearMonth, yearMonthOf } from '@selah/shared-utils';
import { MoneyPipe } from '../../core/money.pipe';
import { TODAY } from '../../core/today';
import { treeRows } from '../budget/plan-view';
import { type ItemReviewDto, ReportsApi } from '../data/finance-api';
import { SECTION_LABELS } from '../records/budget-item-options';

const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * The monthly review (requirements §4): plan vs. actual per section and item,
 * yearly and one-time items with their year so far, what no item covers, and
 * the month's budget transfers including computed resets (ADR 0019).
 */
@Component({
  selector: 'selah-review-page',
  imports: [DatePipe, MoneyPipe, RouterLink],
  templateUrl: './review-page.html',
  styleUrl: './review-page.scss',
})
export class ReviewPage {
  private readonly router = inject(Router);
  private readonly reports = inject(ReportsApi);
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;
  private readonly todayMonth = yearMonthOf(inject(TODAY)());
  protected readonly month = signal<YearMonth>(this.monthFromQuery());

  protected readonly review = this.reports.monthly(this.month);
  protected readonly movements = this.reports.budgetMovements(() => ({
    from: `${this.month()}-01`,
    to: endOfMonth(`${this.month()}-01`),
  }));

  /** A month that hasn't ended yet: its resets are projections (ADR 0019). */
  protected readonly monthOpen = computed(() => this.month() >= this.todayMonth);
  protected readonly noPlan = computed(() => {
    const error = this.review.error();
    return error instanceof HttpErrorResponse && error.status === 404;
  });
  /** Sections in order, each with its items in tree order. */
  protected readonly sections = computed(() => {
    if (!this.review.hasValue()) return [];
    const review = this.review.value();
    const rows = treeRows(review.items);
    return review.sections.map((total) => ({
      ...total,
      label: SECTION_LABELS[total.section],
      rows: rows.filter((r) => r.item.section === total.section),
    }));
  });
  private readonly names = computed(
    () => new Map((this.review.hasValue() ? this.review.value().items : []).map((i) => [i.budgetItemId, i.name])),
  );

  protected previousMonth(): void {
    this.setMonth(previousYearMonth(this.month()));
  }

  protected nextMonth(): void {
    this.setMonth(nextYearMonth(this.month()));
  }

  protected firstOfMonth(month: YearMonth): string {
    return `${month}-01`;
  }

  protected isNegative(amount: string | null | undefined): boolean {
    return !!amount && amount.startsWith('-');
  }

  protected isZero(amount: string): boolean {
    return !/[1-9]/.test(amount);
  }

  /** Income is received against what was expected; every other section is spent against a budget. */
  protected isIncome(section: Section): boolean {
    return section === 'income';
  }

  /** A yearly or one-time item outside its month has nothing planned here; its year line says more. */
  protected quietThisMonth(item: ItemReviewDto): boolean {
    return !!item.year && this.isZero(item.planned) && this.isZero(item.actual);
  }

  protected itemName(id: string | null): string {
    return id ? (this.names().get(id) ?? '') : '';
  }

  /** Records on an item this month, for checking what makes up the actual. */
  protected recordsLink(item: ItemReviewDto) {
    return { month: this.month() === this.todayMonth ? null : this.month(), item: item.budgetItemId };
  }

  private setMonth(month: YearMonth): void {
    this.month.set(month);
    void this.router.navigate([], { queryParams: { month: month === this.todayMonth ? null : month }, replaceUrl: true });
  }

  private monthFromQuery(): YearMonth {
    const asked = this.query.get('month');
    return asked && YEAR_MONTH.test(asked) ? asked : this.todayMonth;
  }
}
