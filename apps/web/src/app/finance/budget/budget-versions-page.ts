import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { YearMonth } from '@selah/shared-types';
import { nextYearMonth, previousYearMonth, yearMonthOf } from '@selah/shared-utils';
import { TODAY } from '../../core/today';
import { FormNavigation } from '../../ui/form-navigation';
import { PlanApi } from '../data/finance-api';
import { PlanDraft } from './plan-draft';

/**
 * The plan's versions: a read-only log of how the plan changed, and starting
 * a new version as a copy of the newest one (ADR 0018). Route: `/budget/versions`.
 */
@Component({
  selector: 'selah-budget-versions-page',
  host: { class: 'form-page' },
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './budget-versions-page.html',
  styleUrl: './budget-versions-page.scss',
})
export class BudgetVersionsPage {
  private readonly planApi = inject(PlanApi);
  protected readonly draft = inject(PlanDraft);
  private readonly nav = inject(FormNavigation);
  private readonly router = inject(Router);
  private readonly todayMonth = yearMonthOf(inject(TODAY)());

  protected readonly versions = this.planApi.versions();
  /** Newest first, each with the month it ends (the month before the next one starts). */
  protected readonly log = computed(() => {
    const list = this.versions.value();
    return list
      .map((version, index) => ({
        ...version,
        until: index + 1 < list.length ? previousYearMonth(list[index + 1].effectiveFromMonth) : null,
      }))
      .reverse();
  });
  private readonly newest = computed(() => this.versions.value().at(-1));
  private readonly newestFull = this.planApi.version(() => this.newest()?.id);
  /** A new version starts after the newest one (ADR 0018). */
  protected readonly earliestStart = computed(() => {
    const newest = this.newest();
    if (!newest) return this.todayMonth;
    const after = nextYearMonth(newest.effectiveFromMonth);
    return after > this.todayMonth ? after : this.todayMonth;
  });

  protected readonly form = inject(NonNullableFormBuilder).group({
    month: ['', Validators.required],
    note: ['', Validators.maxLength(500)],
  });
  protected readonly problem = signal<string | null>(null);

  protected firstOfMonth(month: YearMonth): string {
    return `${month}-01`;
  }

  protected back(): void {
    this.nav.leave('/budget');
  }

  protected start(): void {
    const month = this.form.controls.month.value || this.earliestStart();
    if (month < this.earliestStart()) {
      this.problem.set($localize`:@@versions.tooEarly:A new version must start after the newest one.`);
      return;
    }
    if (this.draft.state()) {
      this.problem.set($localize`:@@versions.draftOpen:Save or discard the plan you're editing first.`);
      return;
    }
    const from = this.newestFull.hasValue() ? this.newestFull.value() : null;
    if (this.newest() && !from) {
      this.problem.set($localize`:@@versions.loading:Still loading the current plan; try again in a moment.`);
      return;
    }
    const note = this.form.controls.note.value.trim();
    this.draft.startNew(from, month, note || null);
    void this.router.navigate(['/budget'], { queryParams: { month } });
  }
}
