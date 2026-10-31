import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, LOCALE_ID, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { normalizePlan, type Plan, type PlanChoice, planOf } from '@selah/planner-core';
import type { LocalDate, PlanGrain } from '@selah/shared-types';
import { addDays } from '@selah/shared-utils';
import { AppSettings } from '../../core/app-settings';
import { problemOf } from '../../core/problem';
import { TODAY } from '../../core/today';
import { FormNavigation } from '../../ui/form-navigation';
import { Toast } from '../../ui/toast';
import { PlannerApi } from '../data/planner-api';
import { planLabel } from '../ui/plan-label';

type Quick = 'today' | 'tomorrow' | 'thisWeek' | 'nextWeek' | 'thisMonth' | 'none' | 'later' | 'custom';

/**
 * When to do a task: a day, a week or a month, no date, or later (the v1 spec,
 * §6). Also where a slipped task is marked done on an earlier day, or let go.
 * Route: `/planner/tasks/:id/plan`.
 */
@Component({
  selector: 'selah-plan-form-page',
  host: { class: 'form-page' },
  imports: [DatePipe],
  templateUrl: './plan-form-page.html',
  styleUrl: './plan-form-page.scss',
})
export class PlanFormPage {
  private readonly api = inject(PlannerApi);
  private readonly nav = inject(FormNavigation);
  private readonly toast = inject(Toast);
  private readonly locale = inject(LOCALE_ID);
  private readonly settings = inject(AppSettings);
  protected readonly today = inject(TODAY)();
  protected readonly yesterday = addDays(this.today, -1);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly detail = this.api.task(() => this.id);
  protected readonly current = computed(() => (this.detail.hasValue() ? (this.detail.value() ?? null) : null));
  protected readonly loading = computed(() => this.detail.isLoading());
  protected readonly notFound = computed(() => !!this.detail.error());
  protected readonly currentPlan = computed(() => {
    const task = this.current()?.task;
    if (!task) return '';
    const plan = planOf(task);
    return plan ? planLabel(plan, this.today, this.locale) : task.later ? $localize`:@@plan.later:Later` : $localize`:@@plan.none:No date`;
  });

  protected readonly quick = signal<Quick>('today');
  protected readonly grain = signal<PlanGrain>('day');
  protected readonly date = signal<string>(this.today);
  protected readonly doneOn = signal<string>(this.yesterday);
  protected readonly saving = signal(false);
  private filled = false;

  protected readonly quickChoices: { value: Quick; label: string }[] = [
    { value: 'today', label: $localize`:@@plan.today:Today` },
    { value: 'tomorrow', label: $localize`:@@plan.tomorrow:Tomorrow` },
    { value: 'thisWeek', label: $localize`:@@plan.thisWeek:This week` },
    { value: 'nextWeek', label: $localize`:@@plan.nextWeek:Next week` },
    { value: 'thisMonth', label: $localize`:@@plan.thisMonth:This month` },
    { value: 'none', label: $localize`:@@plan.none:No date` },
  ];
  protected readonly grains: { value: PlanGrain; label: string }[] = [
    { value: 'day', label: $localize`:@@plan.day:Day` },
    { value: 'week', label: $localize`:@@plan.weekGrain:Week` },
    { value: 'month', label: $localize`:@@plan.month:Month` },
  ];

  /** What the custom picker means, normalized, in words. */
  protected readonly customText = computed(() => {
    const plan = this.customPlan();
    return plan ? planLabel(plan, this.today, this.locale) : '';
  });

  constructor() {
    // Start from the task's own plan when it has one.
    effect(() => {
      const task = this.current()?.task;
      if (!task || this.filled) return;
      this.filled = true;
      const plan = planOf(task);
      if (task.later) this.quick.set('later');
      else if (plan) {
        this.quick.set('custom');
        this.grain.set(plan.grain);
        this.date.set(plan.grain === 'month' ? plan.start.slice(0, 7) : plan.start);
      }
    });
  }

  protected setGrain(grain: PlanGrain): void {
    const date = this.date();
    this.grain.set(grain);
    // A month input takes 'YYYY-MM'; a date input 'YYYY-MM-DD'.
    this.date.set(grain === 'month' ? date.slice(0, 7) : date.length === 7 ? `${date}-01` : date);
    this.quick.set('custom');
  }

  protected setDate(value: string): void {
    if (!value) return;
    this.date.set(value);
    this.quick.set('custom');
  }

  protected cancel(): void {
    this.nav.leave(this.backTo());
  }

  async save(): Promise<void> {
    const choice = this.choice();
    if (choice === undefined) return;
    await this.run(() => this.api.plan(this.id, choice), $localize`:@@plan.saved:Planned.`);
  }

  protected doneEarlier(day: string): Promise<void> {
    if (!day || day > this.today) return Promise.resolve();
    return this.run(() => this.api.done(this.id, { on: day as LocalDate }), $localize`:@@task.doneToast:Done.`);
  }

  protected letGo(): Promise<void> {
    return this.run(() => this.api.letGo(this.id), $localize`:@@task.letGoToast:Let go.`);
  }

  private choice(): PlanChoice | undefined {
    const today = this.today;
    switch (this.quick()) {
      case 'today':
        return { grain: 'day', start: today };
      case 'tomorrow':
        return { grain: 'day', start: addDays(today, 1) };
      case 'thisWeek':
        return { grain: 'week', start: today };
      case 'nextWeek':
        return { grain: 'week', start: addDays(today, 7) };
      case 'thisMonth':
        return { grain: 'month', start: today };
      case 'none':
        return null;
      case 'later':
        return 'later';
      case 'custom':
        return this.customPlan() ?? undefined;
    }
  }

  private customPlan(): Plan | null {
    const date = this.date();
    const start = (this.grain() === 'month' && date.length === 7 ? `${date}-01` : date) as LocalDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
    return normalizePlan({ grain: this.grain(), start }, this.settings.value().weekStartDay);
  }

  private async run(work: () => Promise<void>, message: string): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      await work();
      this.nav.leave(this.backTo(), message);
    } catch (error) {
      this.toast.show(problemOf(error).message);
    } finally {
      this.saving.set(false);
    }
  }

  private backTo(): string {
    return `/planner/tasks/${this.id}`;
  }
}
