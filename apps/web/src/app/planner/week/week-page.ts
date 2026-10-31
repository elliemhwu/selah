import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { PlanChoice, TaskView } from '@selah/planner-core';
import type { LocalDate } from '@selah/shared-types';
import { addDays } from '@selah/shared-utils';
import { problemOf } from '../../core/problem';
import { TODAY } from '../../core/today';
import { Toast } from '../../ui/toast';
import { PlannerApi } from '../data/planner-api';
import { PlannerHeader } from '../ui/planner-header';
import { TaskRow } from '../ui/task-row';

/**
 * The weekly sit-down, like a bullet journal migration (the v1 spec, §6): each
 * day and the week, then what is waiting to be placed. From the sixth day of
 * a week it plans the next one.
 */
@Component({
  selector: 'selah-week-page',
  imports: [DatePipe, PlannerHeader, RouterLink, TaskRow],
  templateUrl: './week-page.html',
  styleUrls: ['../ui/planner-page.scss', './week-page.scss'],
})
export class WeekPage {
  private readonly api = inject(PlannerApi);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);
  protected readonly today = inject(TODAY)();
  protected readonly view = this.api.weekView();
  protected readonly week = computed(() => (this.view.hasValue() ? (this.view.value() ?? null) : null));
  protected readonly end = computed(() => {
    const start = this.week()?.start;
    return start ? addDays(start, 6) : null;
  });
  protected readonly nextWeek = computed(() => (this.week()?.start ?? '') > this.today);
  /** Tasks still waiting for a place, across the sections below the week. */
  protected readonly waiting = computed(() => {
    const w = this.week();
    return w ? w.inbox.length + w.carriedOver.length + w.dueSoon.length + w.thisMonth.length : 0;
  });
  /** The sections of tasks still to place, in the order they're met. */
  protected readonly groups = computed(() => {
    const w = this.week();
    if (!w) return [];
    return [
      { id: 'inbox', title: $localize`:@@planner.inbox:Inbox`, tasks: w.inbox },
      { id: 'carried', title: $localize`:@@week.carried:Carried over`, tasks: w.carriedOver },
      { id: 'due', title: $localize`:@@today.dueSoon:Due soon`, tasks: w.dueSoon },
      { id: 'month', title: $localize`:@@week.thisMonth:This month`, tasks: w.thisMonth },
    ];
  });
  protected readonly busy = signal(false);

  protected toDay(view: TaskView, day: string): Promise<void> {
    return day ? this.place(view, { grain: 'day', start: day as LocalDate }) : Promise.resolve();
  }

  protected toWeek(view: TaskView): Promise<void> {
    const start = this.week()?.start;
    return start ? this.place(view, { grain: 'week', start }) : Promise.resolve();
  }

  protected later(view: TaskView): Promise<void> {
    return this.place(view, 'later');
  }

  protected async letGo(view: TaskView): Promise<void> {
    await this.run(() => this.api.letGo(view.task.id));
  }

  protected finish(): void {
    void this.router.navigateByUrl('/planner');
    this.toast.show($localize`:@@week.done:The week is planned.`);
  }

  private place(view: TaskView, plan: PlanChoice): Promise<void> {
    return this.run(() => this.api.plan(view.task.id, plan));
  }

  private async run(work: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await work();
    } catch (error) {
      this.toast.show(problemOf(error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
