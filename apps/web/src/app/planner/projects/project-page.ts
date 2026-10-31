import { CdkDrag, type CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { problemOf } from '../../core/problem';
import { TODAY } from '../../core/today';
import { Toast } from '../../ui/toast';
import { PlannerApi } from '../data/planner-api';
import { PlannerHeader } from '../ui/planner-header';
import { TaskRow } from '../ui/task-row';

/** A project's tasks in order, finished ones folded away. A queue shows its next task and Study now. */
@Component({
  selector: 'selah-project-page',
  imports: [CdkDrag, CdkDropList, PlannerHeader, RouterLink, TaskRow],
  template: `
    @if (detail.error()) {
      <selah-planner-header i18n-title="@@planner.project" title="Project" back="/planner/projects" i18n-backLabel="@@planner.projects" backLabel="Projects" />
      <div class="page"><p class="muted" i18n="@@project.notFound">This project isn't in the planner.</p></div>
    } @else if (current(); as c) {
      <selah-planner-header [title]="c.project.name" back="/planner/projects" [backLabel]="c.area?.name ?? projectsLabel">
        <a class="link-btn" [routerLink]="['/planner/projects', c.project.id, 'edit']" i18n="@@action.edit">Edit</a>
      </selah-planner-header>
      <div class="page">
        @if (c.group; as group) {
          <p class="small muted group">{{ group.name }}</p>
        }
        @if (c.project.mode === 'queue') {
          <div class="queue-card">
            @if (next(); as task) {
              <span class="small muted" i18n="@@project.next">Next in the queue · {{ done() }}/{{ c.tasks.length }}</span>
              <span class="next-title">{{ task.task.title }}</span>
              <a class="btn btn-primary" routerLink="/planner/study/new" [queryParams]="{ project: c.project.id }" i18n="@@study.title">Study now</a>
            } @else {
              <span class="muted" i18n="@@project.queueDone">Every task in this queue is done.</span>
            }
            <a class="link-btn copy" [routerLink]="['/planner/projects', c.project.id, 'copy']" i18n="@@project.copy">Copy as a new project</a>
          </div>
        }
        <section>
          <div cdkDropList class="drop-list" (cdkDropListDropped)="drop($event)" [cdkDropListDisabled]="moving()">
            @for (task of open(); track task.task.id) {
              <selah-task-row
                cdkDrag
                cdkDragLockAxis="y"
                [cdkDragStartDelay]="{ touch: 350, mouse: 0 }"
                [view]="task"
                [today]="today"
                [showProject]="false"
                [showPlan]="c.project.mode === 'list'"
              />
            } @empty {
              <p class="muted empty" i18n="@@project.empty">No tasks yet.</p>
            }
          </div>
          @if (open().length > 1) {
            <p class="small muted" i18n="@@project.dragHint">Hold a task, then drag it to change the order.</p>
          }
          <a class="btn add" routerLink="/planner/tasks/new" [queryParams]="{ project: c.project.id }" i18n="@@task.newTitle">New task</a>
        </section>
        @if (finished().length) {
          <section>
            <button type="button" class="fold" [attr.aria-expanded]="showFinished()" (click)="showFinished.set(!showFinished())">
              <span class="section-title" i18n="@@project.finished">Finished</span>
              <span class="count">{{ finished().length }}</span>
            </button>
            @if (showFinished()) {
              @for (task of finished(); track task.task.id) {
                <selah-task-row [view]="task" [today]="today" [showProject]="false" />
              }
            }
          </section>
        }
      </div>
    } @else {
      <p class="form-status muted" role="status" i18n="@@planner.loading">Opening the planner…</p>
    }
  `,
  styleUrl: '../ui/planner-page.scss',
  styles: `
    .group {
      margin: -12px 0 0;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .queue-card {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 14px 16px;
      border: 1px dashed var(--rule);
      border-radius: var(--radius);
      background: var(--panel);
    }
    .next-title {
      margin-bottom: 6px;
      font-family: var(--font-title);
      font-size: 18px;
    }
    .copy {
      align-self: center;
    }
    .drop-list {
      min-height: 8px;
    }
    .cdk-drag-preview {
      box-shadow: 0 4px 12px var(--memo-shadow);
      background: var(--paper);
    }
    .cdk-drag-placeholder {
      opacity: 0.3;
    }
    .add {
      align-self: flex-start;
      margin-top: 12px;
    }
    .fold {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      width: 100%;
      min-height: var(--touch);
      padding: 0;
      border: 0;
      border-bottom: 1px solid var(--rule-strong);
      background: none;
      color: var(--ink);
      cursor: pointer;
    }
  `,
})
export class ProjectPage {
  private readonly api = inject(PlannerApi);
  private readonly toast = inject(Toast);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  protected readonly today = inject(TODAY)();
  protected readonly detail = this.api.project(() => this.id);
  protected readonly current = computed(() => (this.detail.hasValue() ? (this.detail.value() ?? null) : null));
  protected readonly open = computed(() => this.current()?.tasks.filter((t) => t.open) ?? []);
  protected readonly finished = computed(() => this.current()?.tasks.filter((t) => !t.open) ?? []);
  protected readonly next = computed(() => this.open()[0] ?? null);
  protected readonly done = computed(() => this.finished().filter((t) => t.status === 'done').length);
  protected readonly showFinished = signal(false);
  protected readonly projectsLabel = $localize`:@@planner.projects:Projects`;
  protected readonly moving = signal(false);

  /** Saves a dragged task's new place: only that task changes (ADR 0033). */
  protected async drop(event: CdkDragDrop<unknown>): Promise<void> {
    if (event.previousIndex === event.currentIndex || this.moving()) return;
    const order = [...this.open()];
    moveItemInArray(order, event.previousIndex, event.currentIndex);
    const moved = order[event.currentIndex];
    const after = order[event.currentIndex - 1]?.task.id ?? null;
    this.moving.set(true);
    try {
      await this.api.moveTask(moved.task.id, after);
    } catch (error) {
      this.toast.show(problemOf(error).message);
    } finally {
      this.moving.set(false);
    }
  }
}
