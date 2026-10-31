import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlannerApi } from '../data/planner-api';
import { PlannerHeader } from '../ui/planner-header';

/** Areas, their groups and projects (the v1 spec, §6). Archived ones are hidden. */
@Component({
  selector: 'selah-projects-page',
  imports: [PlannerHeader, RouterLink],
  template: `
    <selah-planner-header i18n-title="@@planner.projects" title="Projects" back="/planner" i18n-backLabel="@@planner.today" backLabel="Today">
      <a class="link-btn" routerLink="/planner/areas/new" i18n="@@area.newTitle">New area</a>
    </selah-planner-header>
    <div class="page">
      @if (tree.isLoading()) {
        <p class="muted small" role="status" i18n="@@planner.loading">Opening the planner…</p>
      } @else if (tree.error()) {
        <p class="muted" i18n="@@planner.failed">Couldn't open the planner.</p>
      } @else {
        @for (entry of tree.value()?.areas ?? []; track entry.area.id) {
          <section class="area" [attr.aria-label]="entry.area.name">
            <div class="section-head">
              <a class="area-name section-title" [routerLink]="['/planner/areas', entry.area.id]">{{ entry.area.name }}</a>
              <span>
                <a class="link-btn" routerLink="/planner/groups/new" [queryParams]="{ area: entry.area.id }" i18n="@@group.add">+ Group</a>
                <a class="link-btn" routerLink="/planner/projects/new" [queryParams]="{ area: entry.area.id }" i18n="@@project.add">+ Project</a>
              </span>
            </div>
            <ul class="list">
              @for (project of entry.projects; track project.id) {
                <li>
                  <a class="project" [routerLink]="['/planner/projects', project.id]">
                    <span>{{ project.name }}</span>
                    @if (project.mode === 'queue') {
                      <span class="small muted" i18n="@@project.queueBadge">queue</span>
                    }
                  </a>
                </li>
              }
              @for (group of entry.groups; track group.group.id) {
                <li class="group" [style.padding-left.px]="group.depth * 16">
                  <a class="group-name small" [routerLink]="['/planner/groups', group.group.id]">{{ group.group.name }}</a>
                  <ul class="list">
                    @for (project of group.projects; track project.id) {
                      <li>
                        <a class="project" [routerLink]="['/planner/projects', project.id]">
                          <span>{{ project.name }}</span>
                          @if (project.mode === 'queue') {
                            <span class="small muted" i18n="@@project.queueBadge">queue</span>
                          }
                        </a>
                      </li>
                    }
                  </ul>
                </li>
              }
            </ul>
            @if (!entry.projects.length && !entry.groups.length) {
              <p class="muted empty small" i18n="@@area.empty">No projects yet.</p>
            }
          </section>
        } @empty {
          <p class="muted empty" i18n="@@projects.empty">Start with an area of life, such as Work or Study, then add its projects.</p>
          <a class="btn btn-primary" routerLink="/planner/areas/new" i18n="@@area.newTitle">New area</a>
        }
      }
    </div>
  `,
  styleUrl: '../ui/planner-page.scss',
  styles: `
    .area-name {
      color: var(--ink);
      text-decoration: none;
    }
    .project {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 48px;
      border-bottom: 1px dotted var(--rule);
      color: var(--ink);
      text-decoration: none;
    }
    .group-name {
      display: flex;
      align-items: flex-end;
      min-height: 36px;
      color: var(--ink-muted);
      font-weight: 600;
      letter-spacing: 0.06em;
      text-decoration: none;
      text-transform: uppercase;
    }
    .group > .list {
      padding-left: 12px;
    }
  `,
})
export class ProjectsPage {
  protected readonly tree = inject(PlannerApi).tree();
}
