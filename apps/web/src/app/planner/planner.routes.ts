import { Route } from '@angular/router';
import { PlannerShell } from './planner-shell';

/** Form routes hide the bottom navigation and fill the screen on a phone (ADR 0022). */
const form = { form: true };

// Planner, lazy-loaded at /planner (ADR 0030, 0033). Its screens are lazy-loaded per route.
export const plannerRoutes: Route[] = [
  {
    path: '',
    component: PlannerShell,
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: $localize`:@@planner.today:Today`,
        loadComponent: () => import('./today/today-page').then((m) => m.TodayPage),
      },
      {
        path: 'inbox',
        title: $localize`:@@planner.inbox:Inbox`,
        loadComponent: () => import('./inbox/inbox-page').then((m) => m.InboxPage),
      },
      {
        path: 'week',
        title: $localize`:@@planner.week:Plan the week`,
        loadComponent: () => import('./week/week-page').then((m) => m.WeekPage),
      },
      {
        path: 'projects',
        title: $localize`:@@planner.projects:Projects`,
        loadComponent: () => import('./projects/projects-page').then((m) => m.ProjectsPage),
      },
      {
        path: 'projects/new',
        title: $localize`:@@project.newTitle:New project`,
        data: form,
        loadComponent: () => import('./projects/project-form-page').then((m) => m.ProjectFormPage),
      },
      {
        path: 'projects/:id',
        title: $localize`:@@planner.project:Project`,
        loadComponent: () => import('./projects/project-page').then((m) => m.ProjectPage),
      },
      {
        path: 'projects/:id/edit',
        title: $localize`:@@project.editTitle:Edit project`,
        data: form,
        loadComponent: () => import('./projects/project-form-page').then((m) => m.ProjectFormPage),
      },
      {
        path: 'projects/:id/copy',
        title: $localize`:@@project.copyTitle:Copy project`,
        data: form,
        loadComponent: () => import('./projects/copy-project-page').then((m) => m.CopyProjectPage),
      },
      {
        path: 'areas/new',
        title: $localize`:@@area.newTitle:New area`,
        data: { ...form, kind: 'area' },
        loadComponent: () => import('./projects/name-form-page').then((m) => m.NameFormPage),
      },
      {
        path: 'areas/:id',
        title: $localize`:@@area.editTitle:Area`,
        data: { ...form, kind: 'area' },
        loadComponent: () => import('./projects/name-form-page').then((m) => m.NameFormPage),
      },
      {
        path: 'groups/new',
        title: $localize`:@@group.newTitle:New group`,
        data: { ...form, kind: 'group' },
        loadComponent: () => import('./projects/name-form-page').then((m) => m.NameFormPage),
      },
      {
        path: 'groups/:id',
        title: $localize`:@@group.editTitle:Group`,
        data: { ...form, kind: 'group' },
        loadComponent: () => import('./projects/name-form-page').then((m) => m.NameFormPage),
      },
      {
        path: 'tasks/new',
        title: $localize`:@@task.newTitle:New task`,
        data: form,
        loadComponent: () => import('./tasks/task-form-page').then((m) => m.TaskFormPage),
      },
      {
        path: 'tasks/:id',
        title: $localize`:@@task.title:Task`,
        data: form,
        loadComponent: () => import('./tasks/task-form-page').then((m) => m.TaskFormPage),
      },
      {
        path: 'tasks/:id/plan',
        title: $localize`:@@plan.title:Plan`,
        data: form,
        loadComponent: () => import('./tasks/plan-form-page').then((m) => m.PlanFormPage),
      },
      {
        path: 'tasks/:id/continue',
        title: $localize`:@@continue.title:Continue when?`,
        data: form,
        loadComponent: () => import('./tasks/continue-form-page').then((m) => m.ContinueFormPage),
      },
      {
        path: 'study/new',
        title: $localize`:@@study.title:Study now`,
        data: form,
        loadComponent: () => import('./study/study-start-page').then((m) => m.StudyStartPage),
      },
      {
        path: 'study/:id',
        title: $localize`:@@study.title:Study now`,
        data: form,
        loadComponent: () => import('./study/study-page').then((m) => m.StudyPage),
      },
    ],
  },
];
