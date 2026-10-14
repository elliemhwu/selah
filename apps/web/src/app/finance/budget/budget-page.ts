import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Section, YearMonth } from '@selah/shared-types';
import { nextYearMonth, previousYearMonth, yearMonthOf } from '@selah/shared-utils';
import { MoneyPipe } from '../../core/money.pipe';
import { TODAY } from '../../core/today';
import { Toast } from '../../ui/toast';
import { PlanApi, type PlanItemDto } from '../data/finance-api';
import { PlanDraft } from './plan-draft';
import { buildPlanView } from './plan-view';

const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * The budget plan for a month (requirements §3, §4): sections, the item tree,
 * net income and what's unallocated. Shows the draft while editing; otherwise
 * the version in effect, or `?version=<id>` from the version log.
 */
@Component({
  selector: 'selah-budget-page',
  imports: [DatePipe, DecimalPipe, MoneyPipe, NgTemplateOutlet, RouterLink],
  templateUrl: './budget-page.html',
  styleUrl: './budget-page.scss',
})
export class BudgetPage {
  protected readonly draft = inject(PlanDraft);
  private readonly planApi = inject(PlanApi);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;
  private readonly todayMonth = yearMonthOf(inject(TODAY)());
  private readonly versionId = this.query.get('version') ?? undefined;

  protected readonly month = signal<YearMonth>(this.initialMonth());
  protected readonly editing = computed(() => this.draft.state() !== null);

  private readonly active = this.planApi.active(() => (this.editing() || this.versionId ? undefined : this.month()));
  private readonly picked = this.planApi.version(() => (this.editing() ? undefined : this.versionId));
  private readonly shown = computed(() => {
    if (this.editing()) return undefined;
    const resource = this.versionId ? this.picked : this.active;
    return resource.hasValue() ? resource.value() : undefined;
  });

  /** The items on screen and where they come from. */
  protected readonly source = computed(() => {
    const draft = this.draft.state();
    if (draft) return { items: draft.items, from: draft.effectiveFromMonth, editable: true };
    const version = this.shown();
    return version ? { items: version.items, from: version.effectiveFromMonth, editable: version.editable } : null;
  });
  protected readonly view = computed(() => {
    const source = this.source();
    return source ? buildPlanView(source.items, this.month()) : null;
  });
  protected readonly loading = computed(() => !this.editing() && (this.versionId ? this.picked : this.active).isLoading());
  protected readonly noPlan = computed(() => {
    const error = this.active.error();
    return !this.editing() && !this.versionId && error instanceof HttpErrorResponse && error.status === 404;
  });
  /** While editing, months before the draft's start belong to older versions. */
  protected readonly atFirstMonth = computed(() => {
    const draft = this.draft.state();
    return !!draft && this.month() <= draft.effectiveFromMonth;
  });
  protected readonly confirmingDiscard = signal(false);
  protected readonly saving = signal(false);

  protected previousMonth(): void {
    if (!this.atFirstMonth()) this.month.set(previousYearMonth(this.month()));
  }

  protected nextMonth(): void {
    this.month.set(nextYearMonth(this.month()));
  }

  protected firstOfMonth(month: YearMonth): string {
    return `${month}-01`;
  }

  /** A date in month 1–12, for showing the month's name. */
  protected monthOfYear(month: number | null): string {
    return `2000-${String(month ?? 1).padStart(2, '0')}-01`;
  }

  protected isNegative(amount: string | null): boolean {
    return !!amount && amount.startsWith('-');
  }

  protected tag(item: PlanItemDto): 'new' | 'edited' | null {
    const changes = this.draft.changes();
    if (changes.added.has(item.budgetItemId)) return 'new';
    if (changes.edited.has(item.budgetItemId)) return 'edited';
    return null;
  }

  protected itemErrors(item: PlanItemDto): string[] {
    return this.draft.errors().byItem[item.budgetItemId] ?? [];
  }

  /** The other item a rollover reset carries into, for the item's summary line. */
  protected itemName(id: string | null): string {
    return this.source()?.items.find((i) => i.budgetItemId === id)?.name ?? '';
  }

  protected startEditing(): void {
    const version = this.shown();
    if (!version?.editable) return;
    this.draft.edit(version);
    this.month.set(this.month() < version.effectiveFromMonth ? version.effectiveFromMonth : this.month());
  }

  protected startFirstPlan(): void {
    this.draft.startNew(null, this.todayMonth, null);
  }

  protected addItem(section: Section): void {
    void this.router.navigate(['/budget/items/new'], { queryParams: { section } });
  }

  protected discard(): void {
    if (!this.confirmingDiscard()) {
      this.confirmingDiscard.set(true);
      return;
    }
    this.draft.discard();
    this.confirmingDiscard.set(false);
    this.active.reload();
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    const result = await this.draft.save();
    this.saving.set(false);
    if (result.ok) {
      this.toast.show($localize`:@@budget.saved:Plan saved.`);
      this.active.reload();
    } else {
      this.toast.show(result.message);
    }
  }

  private initialMonth(): YearMonth {
    const asked = this.query.get('month');
    if (asked && YEAR_MONTH.test(asked)) return asked;
    const draft = this.draft.state();
    if (draft && this.todayMonth < draft.effectiveFromMonth) return draft.effectiveFromMonth;
    return this.todayMonth;
  }
}
