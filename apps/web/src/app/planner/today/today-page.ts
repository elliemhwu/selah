import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { TaskView } from '@selah/planner-core';
import { problemOf } from '../../core/problem';
import { TODAY } from '../../core/today';
import { Icon } from '../../ui/icon';
import { Toast } from '../../ui/toast';
import { PlannerApi } from '../data/planner-api';
import { PlannerHeader } from '../ui/planner-header';
import { TaskRow } from '../ui/task-row';

/**
 * Today (the v1 spec, §6): what's planned for today, then what needs a
 * decision (Overdue, Slipped, Due soon), then the week and month pool.
 */
@Component({
  selector: 'selah-today-page',
  imports: [DatePipe, Icon, PlannerHeader, RouterLink, TaskRow],
  templateUrl: './today-page.html',
  styleUrls: ['../ui/planner-page.scss', './today-page.scss'],
})
export class TodayPage {
  private readonly api = inject(PlannerApi);
  private readonly toast = inject(Toast);
  protected readonly today = inject(TODAY)();
  protected readonly view = this.api.todayView();
  protected readonly upcoming = this.api.upcoming();
  protected readonly ready = computed(() => (this.view.hasValue() ? this.view.value() : null));

  /** The pool opens by itself when nothing is left for today. */
  private readonly poolToggled = signal<boolean | null>(null);
  protected readonly poolOpen = computed(() => this.poolToggled() ?? (this.ready()?.openToday ?? 0) === 0);
  protected readonly busy = signal(false);

  protected togglePool(): void {
    this.poolToggled.set(!this.poolOpen());
  }

  protected planToday(view: TaskView): Promise<void> {
    return this.run(() => this.api.plan(view.task.id, { grain: 'day', start: this.today }));
  }

  protected letGo(view: TaskView): Promise<void> {
    return this.run(() => this.api.letGo(view.task.id), $localize`:@@task.letGone:Let go of “${view.task.title}:title:”.`);
  }

  private async run(work: () => Promise<void>, message?: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await work();
      if (message) this.toast.show(message);
    } catch (error) {
      this.toast.show(problemOf(error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
