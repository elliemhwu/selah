import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { TaskView } from '@selah/planner-core';
import { problemOf } from '../../core/problem';
import { Toast } from '../../ui/toast';
import { PlannerApi } from '../data/planner-api';

/**
 * A Study-now session: each queue or task shows what's next, with Done and
 * Worked on it; End session closes it (the v1 spec, §6). Route: `/planner/study/:id`.
 */
@Component({
  selector: 'selah-study-page',
  host: { class: 'form-page' },
  imports: [DatePipe],
  template: `
    <header class="form-header">
      <div class="form-header-inner">
        <span class="header-spacer"></span>
        <h1>
          <ng-container i18n="@@study.title">Study now</ng-container>
          @if (current(); as v) {
            <span class="since small muted" i18n="@@study.since">since {{ v.session.startedAt | date: 'HH:mm' }}</span>
          }
        </h1>
        <button type="button" class="btn btn-quiet" [disabled]="saving()" (click)="end()" i18n="@@study.end">End session</button>
      </div>
    </header>

    @if (session.error()) {
      <p class="form-status muted" i18n="@@study.notFound">This session isn't in the planner.</p>
    } @else if (current(); as v) {
      <div class="form-body">
        @for (entry of v.items; track entry.item.id) {
          <article class="source">
            <span class="small muted">
              @if (entry.project; as project) {
                {{ project.name }}
              }
              @if (entry.item.projectId) {
                · {{ entry.done }}/{{ entry.total }}
              }
            </span>
            @if (entry.current; as task) {
              <span class="source-title">{{ task.task.title }}</span>
              @if (task.started) {
                <span class="small muted" i18n="@@study.started">started · stays at the front</span>
              }
              <div class="buttons">
                <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="done(task)" i18n="@@taskRecord.done">Done</button>
                <button type="button" class="btn" [disabled]="saving()" (click)="workedOn(task)" i18n="@@taskRecord.workedOn">Worked on it</button>
              </div>
            } @else {
              <span class="muted" i18n="@@study.sourceDone">All done here.</span>
            }
          </article>
        }

        @if (v.done.length) {
          <section aria-labelledby="session-done">
            <h2 id="session-done" class="section-title" i18n="@@study.thisSession">This session</h2>
            <ul class="done-list">
              @for (task of v.done; track task.task.id) {
                <li><span class="done-mark">✓</span>{{ task.task.title }}</li>
              }
            </ul>
          </section>
        }
      </div>
    } @else {
      <p class="form-status muted" role="status" i18n="@@planner.loading">Opening the planner…</p>
    }
  `,
  styles: `
    .header-spacer {
      width: 60px;
    }
    h1 {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .since {
      font-style: normal;
    }
    .form-body {
      gap: 16px;
    }
    .source {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 14px 16px;
      border: 1px dashed var(--rule);
      border-radius: var(--radius);
      background: var(--panel);
    }
    .source-title {
      font-family: var(--font-title);
      font-size: 18px;
    }
    .buttons {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    .done-list {
      margin: 0;
      padding: 0;
      list-style: none;
      li {
        display: flex;
        align-items: center;
        min-height: 44px;
        border-bottom: 1px dotted var(--rule);
        color: var(--ink-muted);
        text-decoration: line-through;
      }
    }
    .done-mark {
      width: 16px;
      height: 16px;
      margin: 0 12px 0 0;
      font-size: 11px;
    }
  `,
})
export class StudyPage {
  private readonly api = inject(PlannerApi);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly session = this.api.session(() => this.id);
  protected readonly current = computed(() => (this.session.hasValue() ? (this.session.value() ?? null) : null));
  protected readonly saving = signal(false);

  protected done(task: TaskView): Promise<void> {
    return this.run(() => this.api.done(task.task.id, { sessionId: this.id }));
  }

  /** In a session, worked on it keeps the default: a queue task stays at the front, a list task moves to tomorrow. */
  protected workedOn(task: TaskView): Promise<void> {
    return this.run(async () => {
      await this.api.workedOn(task.task.id, { sessionId: this.id });
    });
  }

  protected async end(): Promise<void> {
    await this.run(async () => {
      await this.api.endSession(this.id);
      await this.router.navigateByUrl('/planner', { replaceUrl: true });
      this.toast.show($localize`:@@study.ended:Session ended.`);
    });
  }

  private async run(work: () => Promise<void>): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      await work();
    } catch (error) {
      this.toast.show(problemOf(error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
