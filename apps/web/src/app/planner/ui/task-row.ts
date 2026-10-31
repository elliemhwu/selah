import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, LOCALE_ID, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { TaskView } from '@selah/planner-core';
import type { LocalDate } from '@selah/shared-types';
import { problemOf } from '../../core/problem';
import { Toast } from '../../ui/toast';
import { PlannerApi } from '../data/planner-api';
import { planLabel } from './plan-label';

/**
 * One task: a square checkbox that records it done (or takes that back), the
 * title opening the task, and a line of what matters about it. Actions go in
 * the content slot, on the right.
 */
@Component({
  selector: 'selah-task-row',
  imports: [DatePipe, RouterLink],
  template: `
    <div class="task-row" [class.finished]="!view().open">
      @if (checkable()) {
        <input
          type="checkbox"
          class="check"
          [checked]="view().status === 'done'"
          [disabled]="saving() || view().status === 'let_go'"
          (change)="toggle()"
          [attr.aria-label]="checkLabel()"
        />
      }
      <a class="task-text" [routerLink]="['/planner/tasks', view().task.id]">
        <span class="task-title">{{ view().task.title }}</span>
        <span class="task-meta small muted">
          @if (view().prioritized && view().open) {
            <span class="badge first" i18n="@@task.first">First</span>
          }
          @if (view().started && view().open) {
            <span class="badge" i18n="@@task.started">started</span>
          }
          @if (view().status === 'let_go') {
            <span class="badge" i18n="@@task.letGoBadge">let go</span>
          }
          @if (showProject() && view().project; as project) {
            <span>{{ project.name }}</span>
          }
          @if (showPlan() && planText(); as text) {
            <span>{{ text }}</span>
          }
          @if (view().task.dueDate; as due) {
            <span [class.overdue]="view().open && due < today()" i18n="@@task.due">due {{ due | date: 'EEE d MMM' }}</span>
          }
        </span>
      </a>
      <div class="task-actions"><ng-content /></div>
    </div>
  `,
  styleUrl: './task-row.scss',
})
export class TaskRow {
  private readonly api = inject(PlannerApi);
  private readonly toast = inject(Toast);
  private readonly locale = inject(LOCALE_ID);

  readonly view = input.required<TaskView>();
  readonly today = input.required<LocalDate>();
  readonly showProject = input(true);
  readonly showPlan = input(false);
  readonly checkable = input(true);

  protected readonly saving = signal(false);
  protected readonly planText = computed(() => {
    const plan = this.view().plan;
    return plan ? planLabel(plan, this.today(), this.locale) : this.view().task.later ? $localize`:@@plan.later:Later` : null;
  });
  protected readonly checkLabel = computed(() =>
    this.view().status === 'done'
      ? $localize`:@@task.undone:Not done yet: ${this.view().task.title}:title:`
      : $localize`:@@task.markDone:Done: ${this.view().task.title}:title:`,
  );

  protected async toggle(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    const id = this.view().task.id;
    try {
      if (this.view().status === 'done') await this.api.reopen(id);
      else await this.api.done(id);
    } catch (error) {
      this.toast.show(problemOf(error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
