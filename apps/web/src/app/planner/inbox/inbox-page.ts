import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TODAY } from '../../core/today';
import { PlannerApi } from '../data/planner-api';
import { PlannerHeader } from '../ui/planner-header';
import { TaskRow } from '../ui/task-row';

/** Tasks with no project yet, oldest first; each opens to move or plan it. */
@Component({
  selector: 'selah-inbox-page',
  imports: [PlannerHeader, RouterLink, TaskRow],
  template: `
    <selah-planner-header i18n-title="@@planner.inbox" title="Inbox" back="/planner" i18n-backLabel="@@planner.today" backLabel="Today">
      <a class="link-btn" routerLink="/planner/tasks/new" i18n="@@task.newTitle">New task</a>
    </selah-planner-header>
    <div class="page">
      @if (tasks.isLoading()) {
        <p class="muted small" role="status" i18n="@@planner.loading">Opening the planner…</p>
      } @else if (tasks.error()) {
        <p class="muted" i18n="@@planner.failed">Couldn't open the planner.</p>
      } @else {
        <section>
          @for (task of tasks.value() ?? []; track task.task.id) {
            <selah-task-row [view]="task" [today]="today" [showPlan]="true">
              <a class="link-btn" [routerLink]="['/planner/tasks', task.task.id, 'plan']" i18n="@@task.planAction">Plan…</a>
            </selah-task-row>
          } @empty {
            <p class="muted empty" i18n="@@inbox.empty">Nothing waiting. New tasks land here until they have a project.</p>
          }
        </section>
      }
    </div>
  `,
  styleUrl: '../ui/planner-page.scss',
})
export class InboxPage {
  protected readonly today = inject(TODAY)();
  protected readonly tasks = inject(PlannerApi).inbox();
}
