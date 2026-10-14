import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  type Anchor,
  type Cadence,
  type PercentBase,
  type ResetAction,
  type ResetCycle,
  type Section,
  SECTIONS,
} from '@selah/shared-types';
import { formatMoney, formatPercent, parseMoney, parsePercent, percentOfBase, yearMonthOf } from '@selah/shared-utils';
import { map } from 'rxjs';
import { MoneyPipe } from '../../core/money.pipe';
import { TODAY } from '../../core/today';
import { FormNavigation } from '../../ui/form-navigation';
import type { PlanItemDto } from '../data/finance-api';
import { SECTION_LABELS } from '../records/budget-item-options';
import { MONEY_PATTERN } from '../records/form-errors';
import { PlanDraft } from './plan-draft';
import { buildPlanView, treeRows } from './plan-view';

const PERCENT_PATTERN = /^(100(\.0{1,4})?|\d{1,2}(\.\d{1,4})?)$/;
const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Reset cycles each cadence supports; a period must not cross a reset (ADR 0018). */
const RESETS: Partial<Record<Cadence, readonly ResetCycle[]>> = {
  daily: ['never', 'week', 'month', 'year'],
  weekly: ['never', 'week'],
  monthly: ['never', 'month', 'year'],
};

/**
 * One item of the plan being edited (requirements §3). Done keeps the change
 * in the draft; the plan is saved as a whole from the budget screen (ADR 0018).
 * Routes: `/budget/items/:id`, `/budget/items/new?section=expense` (ADR 0022).
 */
@Component({
  selector: 'selah-budget-item-page',
  host: { class: 'form-page' },
  imports: [DatePipe, DecimalPipe, MoneyPipe, ReactiveFormsModule, RouterLink],
  templateUrl: './budget-item-page.html',
  styleUrl: './budget-item-page.scss',
})
export class BudgetItemPage {
  protected readonly draft = inject(PlanDraft);
  private readonly nav = inject(FormNavigation);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly route = inject(ActivatedRoute).snapshot;
  private readonly todayMonth = yearMonthOf(inject(TODAY)());

  private readonly paramId = this.route.paramMap.get('id') ?? 'new';
  private readonly existing = this.paramId === 'new' ? undefined : this.draft.item(this.paramId);
  protected readonly isNew = this.paramId === 'new';
  protected readonly id = this.existing?.budgetItemId ?? crypto.randomUUID();
  protected readonly section: Section =
    this.existing?.section ?? (SECTIONS.find((s) => s === this.route.queryParamMap.get('section')) ?? 'expense');
  protected readonly sectionLabel = SECTION_LABELS[this.section];
  /** Nothing to edit: no draft, or an id that isn't in it. */
  protected readonly missing = !this.draft.state() || (!this.isNew && !this.existing);
  protected readonly errors = this.existing ? (this.draft.errors().byItem[this.existing.budgetItemId] ?? []) : [];

  protected readonly form = this.fb.group({
    name: this.existing?.name ?? '',
    parentItemId: this.existing?.parentItemId ?? '',
    cadence: (this.existing?.cadence ?? 'monthly') as Cadence,
    cadenceMonth: this.existing?.cadenceMonth ?? 1,
    cadenceDate: this.existing?.cadenceDate ?? '',
    anchor: (this.existing?.anchor ?? 'amount') as Anchor,
    amount: this.existing?.amount ? this.existing.amount.replace(/\.00$/, '') : '',
    percent: this.existing?.percent ? this.existing.percent.replace(/\.?0+$/, '') : '',
    percentBase: (this.existing?.percentBase ?? (this.section === 'government' ? 'gross_income' : 'net_income')) as PercentBase,
    rollover: this.existing?.rollover ?? false,
    resetCycle: (this.existing?.resetCycle ?? 'never') as ResetCycle,
    onReset: (this.existing?.onReset ?? 'drop') as ResetAction,
    carryToItemId: this.existing?.carryToItemId ?? '',
    overrides: this.fb.array(
      (this.existing?.overrides ?? []).map((o) => this.override(o.month, o.amount.replace(/\.00$/, ''))),
    ),
  });
  protected readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  protected readonly problems = signal<string[]>([]);
  protected readonly confirmingRemove = signal(false);

  // ---- Choices the plan rules allow (ADR 0018, 0019) -------------------------

  protected readonly cadences: { value: Cadence; label: string }[] = [
    { value: 'daily', label: $localize`:@@cadence.daily:Daily` },
    { value: 'weekly', label: $localize`:@@cadence.weekly:Weekly` },
    { value: 'monthly', label: $localize`:@@cadence.monthly:Monthly` },
    { value: 'yearly', label: $localize`:@@cadence.yearly:Yearly` },
    { value: 'one_time', label: $localize`:@@cadence.once:Once` },
  ];
  protected readonly months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, date: `2000-${String(i + 1).padStart(2, '0')}-01` }));
  /** Income is the base itself; daily and weekly items can't be a share of a monthly base. */
  protected readonly percentAllowed = computed(() => {
    const cadence = this.value().cadence;
    return this.section !== 'income' && cadence !== 'daily' && cadence !== 'weekly';
  });
  protected readonly rolloverAllowed = computed(() => this.section !== 'income' && !!RESETS[this.value().cadence]);
  protected readonly resetOptions = computed(() => RESETS[this.value().cadence] ?? []);
  protected readonly parents = computed(() => {
    const items = this.draft.state()?.items ?? [];
    const below = this.descendants(items);
    return treeRows(items.filter((i) => i.section === this.section && i.budgetItemId !== this.id && !below.has(i.budgetItemId)));
  });
  protected readonly carryTargets = computed(() =>
    (this.draft.state()?.items ?? []).filter((i) => i.section !== 'income' && i.budgetItemId !== this.id),
  );
  protected readonly childCount = computed(() => this.descendants(this.draft.state()?.items ?? []).size);

  /** The month the preview shows: this month, or the draft's first month if later. */
  protected readonly previewMonth = computed(() => {
    const from = this.draft.state()?.effectiveFromMonth ?? this.todayMonth;
    return this.todayMonth < from ? from : this.todayMonth;
  });
  /** What this item would give the month, and its share of net income, with the current entries. */
  protected readonly preview = computed(() => {
    const item = this.toItem(false);
    const draft = this.draft.state();
    if (!item || !draft) return null;
    const items = draft.items.some((i) => i.budgetItemId === item.budgetItemId)
      ? draft.items.map((i) => (i.budgetItemId === item.budgetItemId ? item : i))
      : [...draft.items, item];
    const view = buildPlanView(items, this.previewMonth());
    if (view.error || view.netIncome === null) return null;
    const row = view.sections.flatMap((s) => s.rows).find((r) => r.item.budgetItemId === item.budgetItemId);
    const monthly = row?.monthly ?? null;
    const percent = monthly === null ? null : percentOfBase(parseMoney(monthly), parseMoney(view.netIncome));
    return { monthly, share: percent === null ? null : formatPercent(percent) };
  });

  constructor() {
    // Keep dependent fields valid as the cadence changes.
    effect(() => {
      const { cadence, anchor, resetCycle } = this.value();
      if (!this.percentAllowed() && anchor === 'percent') this.form.controls.anchor.setValue('amount');
      if (!this.rolloverAllowed() && this.form.controls.rollover.value) this.form.controls.rollover.setValue(false);
      const resets = RESETS[cadence];
      if (resets && !resets.includes(resetCycle)) this.form.controls.resetCycle.setValue('never');
      if (cadence !== 'monthly' && this.form.controls.overrides.length) this.form.controls.overrides.clear();
    });
  }

  protected addOverride(): void {
    this.form.controls.overrides.push(this.override(this.previewMonth(), ''));
  }

  protected removeOverride(index: number): void {
    this.form.controls.overrides.removeAt(index);
  }

  protected cancel(): void {
    this.nav.leave('/budget');
  }

  protected done(): void {
    const item = this.toItem(true);
    if (!item) return;
    this.draft.putItem(item);
    this.nav.leave('/budget');
  }

  protected remove(): void {
    if (!this.confirmingRemove()) {
      this.confirmingRemove.set(true);
      return;
    }
    this.draft.removeItem(this.id);
    this.nav.leave('/budget');
  }

  /**
   * The item as the form describes it, normalised the way the API returns it,
   * so unchanged items compare equal. With `report`, explains what's missing.
   */
  private toItem(report: boolean): PlanItemDto | null {
    const v = this.form.getRawValue();
    const problems: string[] = [];
    if (!v.name.trim()) problems.push($localize`:@@budgetItem.needsName:Give the item a name.`);
    const percent = v.anchor === 'percent';
    if (!percent && !MONEY_PATTERN.test(v.amount)) problems.push($localize`:@@budgetItem.needsAmount:Enter the amount in whole TWD.`);
    else if (!percent && !/^\d+$/.test(v.amount.replace(/\.0{1,2}$/, ''))) problems.push($localize`:@@budgetItem.wholeAmount:Plan amounts are whole TWD.`);
    if (percent && !PERCENT_PATTERN.test(v.percent)) problems.push($localize`:@@budgetItem.needsPercent:Enter a percentage from 0 to 100.`);
    if (v.cadence === 'one_time' && !LOCAL_DATE.test(v.cadenceDate)) problems.push($localize`:@@budgetItem.needsDate:Choose the date.`);
    const carry = v.rollover && v.resetCycle !== 'never' && v.onReset === 'carry';
    if (carry && !v.carryToItemId) problems.push($localize`:@@budgetItem.needsCarryTarget:Choose the item to carry into.`);
    const overrides = v.cadence === 'monthly' ? v.overrides : [];
    if (overrides.some((o) => !YEAR_MONTH.test(o.month) || !/^\d{1,12}$/.test(o.amount))) {
      problems.push($localize`:@@budgetItem.overrideInvalid:Each different month needs a month and a whole amount.`);
    }
    if (report) this.problems.set(problems);
    if (problems.length) return null;

    const rollover = this.rolloverAllowed() && v.rollover;
    return {
      budgetItemId: this.id,
      section: this.section,
      name: v.name.trim(),
      parentItemId: v.parentItemId || null,
      cadence: v.cadence,
      cadenceMonth: v.cadence === 'yearly' ? Number(v.cadenceMonth) : null,
      cadenceDate: v.cadence === 'one_time' ? v.cadenceDate : null,
      anchor: v.anchor,
      amount: percent ? null : formatMoney(parseMoney(v.amount)),
      percent: percent ? formatPercent(parsePercent(v.percent)) : null,
      percentBase: this.section === 'government' ? 'gross_income' : v.percentBase,
      rollover,
      resetCycle: rollover ? v.resetCycle : null,
      onReset: rollover && v.resetCycle !== 'never' ? v.onReset : null,
      carryToItemId: rollover && carry ? v.carryToItemId : null,
      overrides: overrides.map((o) => ({ month: o.month, amount: formatMoney(parseMoney(o.amount)) })),
    };
  }

  private override(month: string, amount: string) {
    return this.fb.group({ month, amount });
  }

  /** Ids of every item under this one. */
  private descendants(items: readonly PlanItemDto[]): Set<string> {
    const below = new Set<string>();
    for (let grew = true; grew; ) {
      grew = false;
      for (const item of items) {
        const parent = item.parentItemId;
        if (parent && (parent === this.id || below.has(parent)) && !below.has(item.budgetItemId)) {
          below.add(item.budgetItemId);
          grew = true;
        }
      }
    }
    return below;
  }
}
