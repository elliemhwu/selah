import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MoneyPipe } from '../../core/money.pipe';
import { TODAY } from '../../core/today';
import { Icon } from '../../ui/icon';
import { type ChecklistItemDto, type EnvelopeDto, ReportsApi } from '../data/finance-api';

/**
 * Home (requirements §4): what's left in each envelope, this period's
 * checklist, and a new entry. Entries open as routes (ADR 0022); this screen
 * loads fresh numbers each time it is shown.
 */
@Component({
  selector: 'selah-home-page',
  imports: [DatePipe, Icon, MoneyPipe, RouterLink],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage {
  private readonly reports = inject(ReportsApi);

  protected readonly today = signal(inject(TODAY)());
  protected readonly envelopes = this.reports.envelopes(this.today);
  protected readonly checklist = this.reports.checklist(this.today);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());

  /** Both reports answer 404 when no plan version covers today. */
  protected readonly noPlan = computed(() => {
    const error = this.envelopes.error();
    return error instanceof HttpErrorResponse && error.status === 404;
  });
  protected readonly failed = computed(() => !this.noPlan() && (!!this.envelopes.error() || !!this.checklist.error()));
  protected readonly loading = computed(() => this.envelopes.isLoading() || this.checklist.isLoading());
  protected readonly doneCount = computed(() => this.checklist.value().filter((item) => item.done).length);
  /** Query parameters for batch entry of the selected items, in checklist order. */
  protected readonly batchParams = computed(() => ({
    items: this.checklist
      .value()
      .filter((item) => this.selected().has(item.budgetItemId))
      .map((item) => item.budgetItemId)
      .join(','),
    date: this.today(),
  }));

  protected periodLabel(envelope: EnvelopeDto): string {
    switch (envelope.cadence) {
      case 'daily':
        return $localize`:@@home.period.day:a day`;
      case 'weekly':
        return $localize`:@@home.period.week:a week`;
      default:
        return $localize`:@@home.period.month:a month`;
    }
  }

  protected isNegative(amount: string): boolean {
    return amount.startsWith('-');
  }

  /** Pre-fills the entry form from a plan item (requirements §2). */
  protected recordParams(item: ChecklistItemDto) {
    return { type: item.section === 'income' ? 'income' : 'expense', item: item.budgetItemId, amount: item.planned };
  }

  protected toggle(item: ChecklistItemDto, checked: boolean): void {
    const next = new Set(this.selected());
    if (checked) next.add(item.budgetItemId);
    else next.delete(item.budgetItemId);
    this.selected.set(next);
  }
}
