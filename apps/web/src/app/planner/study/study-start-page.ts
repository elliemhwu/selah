import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { SessionSource } from '@selah/planner-core';
import { problemOf } from '../../core/problem';
import { FormNavigation } from '../../ui/form-navigation';
import { Toast } from '../../ui/toast';
import { PlannerApi } from '../data/planner-api';

/**
 * Starting a Study-now block: pick queues (each gives its next task) and
 * tasks planned for today (the v1 spec, §6). Route: `/planner/study/new` (`?project=`).
 */
@Component({
  selector: 'selah-study-start-page',
  host: { class: 'form-page' },
  template: `
    <header class="form-header">
      <div class="form-header-inner">
        <button type="button" class="btn btn-quiet" (click)="cancel()" i18n="@@action.cancel">Cancel</button>
        <h1 i18n="@@study.title">Study now</h1>
        <button type="button" class="btn btn-quiet save" [disabled]="saving() || !picked().size" (click)="start()" i18n="@@study.start">Start</button>
      </div>
    </header>

    @if (view.isLoading()) {
      <p class="form-status muted" role="status" i18n="@@planner.loading">Opening the planner…</p>
    } @else if (view.value(); as v) {
      <div class="form-body">
        @if (v.queues.length) {
          <h2 class="section-title" i18n="@@study.queues">Queues</h2>
          @for (queue of v.queues; track queue.project.id) {
            <label class="pick">
              <input type="checkbox" class="check" [checked]="picked().has('p:' + queue.project.id)" (change)="toggle('p:' + queue.project.id)" />
              <span class="pick-text">
                <span class="small muted">{{ queue.project.name }} · {{ queue.done }}/{{ queue.total }}</span>
                <span>{{ queue.next.task.title }}</span>
              </span>
            </label>
          }
        }
        @if (todayTasks().length) {
          <h2 class="section-title" i18n="@@study.todayTasks">From today</h2>
          @for (task of todayTasks(); track task.task.id) {
            <label class="pick">
              <input type="checkbox" class="check" [checked]="picked().has('t:' + task.task.id)" (change)="toggle('t:' + task.task.id)" />
              <span class="pick-text">
                @if (task.project; as project) {
                  <span class="small muted">{{ project.name }}</span>
                }
                <span>{{ task.task.title }}</span>
              </span>
            </label>
          }
        }
        @if (!v.queues.length && !todayTasks().length) {
          <p class="muted" i18n="@@study.nothing">Nothing to study yet: make a queue, or plan a task for today.</p>
        }
      </div>
    }
  `,
  styles: `
    .form-body {
      gap: 0;
    }
    h2 {
      margin-top: 16px;
    }
    .pick {
      display: flex;
      align-items: center;
      min-height: 56px;
      border-bottom: 1px dotted var(--rule);
      cursor: pointer;
    }
    .check {
      margin-left: -4px;
    }
    .pick-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
  `,
})
export class StudyStartPage {
  private readonly api = inject(PlannerApi);
  private readonly nav = inject(FormNavigation);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);
  /** Generated once, so a retry never starts two sessions (ADR 0007). */
  private readonly id = crypto.randomUUID();

  protected readonly view = this.api.todayView();
  protected readonly todayTasks = computed(() => (this.view.value()?.today ?? []).filter((t) => t.open && !t.inQueue));
  protected readonly picked = signal(new Set<string>(this.fromRoute()));
  protected readonly saving = signal(false);

  protected toggle(key: string): void {
    const next = new Set(this.picked());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.picked.set(next);
  }

  protected cancel(): void {
    this.nav.leave('/planner');
  }

  protected async start(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    const sources: SessionSource[] = [...this.picked()].map((key) => (key.startsWith('p:') ? { projectId: key.slice(2) } : { taskId: key.slice(2) }));
    try {
      await this.api.startSession(this.id, sources);
      await this.router.navigate(['/planner/study', this.id], { replaceUrl: true });
    } catch (error) {
      this.toast.show(problemOf(error).message);
    } finally {
      this.saving.set(false);
    }
  }

  private fromRoute(): string[] {
    const project = inject(ActivatedRoute).snapshot.queryParamMap.get('project');
    return project ? [`p:${project}`] : [];
  }
}
