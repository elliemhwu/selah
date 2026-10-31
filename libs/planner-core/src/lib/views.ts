import type { IsoWeekday, LocalDate } from '@selah/shared-types';
import { addDays, startOfMonth, startOfWeek, toDayNumber } from '@selah/shared-utils';
import { type Plan, planContains, planEnd, planOf } from './plan';
import { isLive, type PlannerData, type ProjectRow, type SessionItemRow, type SessionRow, type TaskRecordRow, type TaskRow } from './rows';

// What the screens show (the v1 spec, §5), calculated from the rows on every
// read and never stored (ADR 0011). Every view takes `today`, the device's
// local date, so tests never depend on the clock.

/** How many days ahead an unplanned due date shows in Due soon. */
export const DUE_SOON_DAYS = 7;

export type TaskStatus = 'not_started' | 'started' | 'done' | 'let_go';

/** A task with what the screens need to know about it. */
export interface TaskView {
  task: TaskRow;
  project: ProjectRow | null;
  status: TaskStatus;
  /** Open: not done and not let go. */
  open: boolean;
  /** Has a live worked-on record. */
  started: boolean;
  /** Prioritized for today. */
  prioritized: boolean;
  inQueue: boolean;
  plan: Plan | null;
  /** The day it was done or let go, if it was. */
  endedOn: LocalDate | null;
}

export interface QueueSummary {
  project: ProjectRow;
  /** The open task with the lowest position. */
  next: TaskView;
  done: number;
  total: number;
}

export interface TodayView {
  /** Planned for today: open ones, and ones finished today so they stay crossed out. Prioritized first. */
  today: TaskView[];
  openToday: number;
  overdue: TaskView[];
  slipped: TaskView[];
  dueSoon: TaskView[];
  /** Planned for this week, then this month. */
  pool: TaskView[];
  inboxCount: number;
  /** Each active queue with an open task. */
  queues: QueueSummary[];
}

/** Reads the rows once, for the views below. */
class Index {
  private readonly records = new Map<string, TaskRecordRow[]>();
  private readonly projects = new Map<string, ProjectRow>();
  private readonly hiddenProjects = new Set<string>();

  constructor(
    readonly data: PlannerData,
    readonly today: LocalDate,
  ) {
    for (const record of data.taskRecords) {
      if (!isLive(record)) continue;
      const list = this.records.get(record.taskId) ?? [];
      list.push(record);
      this.records.set(record.taskId, list);
    }
    const hiddenAreas = new Set(data.areas.filter((a) => !isLive(a) || a.archivedAt).map((a) => a.id));
    for (const project of data.projects) {
      this.projects.set(project.id, project);
      if (!isLive(project) || project.archivedAt || hiddenAreas.has(project.areaId)) this.hiddenProjects.add(project.id);
    }
  }

  /** Live tasks in a live, unarchived project or the Inbox. */
  visibleTasks(): TaskRow[] {
    return this.data.tasks.filter((t) => isLive(t) && (t.projectId === null || !this.hiddenProjects.has(t.projectId)));
  }

  isVisibleProject(project: ProjectRow): boolean {
    return !this.hiddenProjects.has(project.id);
  }

  view(task: TaskRow): TaskView {
    const records = this.records.get(task.id) ?? [];
    const outcome = records.find((r) => r.kind !== 'worked_on');
    const started = records.some((r) => r.kind === 'worked_on');
    const status: TaskStatus = outcome ? (outcome.kind as 'done' | 'let_go') : started ? 'started' : 'not_started';
    const project = task.projectId ? (this.projects.get(task.projectId) ?? null) : null;
    return {
      task,
      project,
      status,
      open: !outcome,
      started,
      prioritized: task.prioritizedOn === this.today,
      inQueue: project?.mode === 'queue',
      plan: planOf(task),
      endedOn: outcome?.occurredOn ?? null,
    };
  }
}

const byPosition = (a: TaskView, b: TaskView) => a.task.position - b.task.position || a.task.id.localeCompare(b.task.id);
const byDue = (a: TaskView, b: TaskView) => (a.task.dueDate ?? '').localeCompare(b.task.dueDate ?? '') || byPosition(a, b);
const byPlan = (a: TaskView, b: TaskView) => (a.plan?.start ?? '').localeCompare(b.plan?.start ?? '') || byPosition(a, b);

const isOverdue = (v: TaskView, today: LocalDate) => v.open && v.task.dueDate !== null && v.task.dueDate < today;
const isSlipped = (v: TaskView, today: LocalDate) => v.open && !isOverdue(v, today) && v.plan !== null && planEnd(v.plan) <= today;

/** The Today screen. */
export function todayView(data: PlannerData, today: LocalDate): TodayView {
  const index = new Index(data, today);
  const views = index.visibleTasks().map((t) => index.view(t));
  const dueSoonEnd = addDays(today, DUE_SOON_DAYS);

  const todays = views
    .filter((v) => v.plan?.grain === 'day' && v.plan.start === today && (v.open || v.endedOn === today) && v.status !== 'let_go')
    .sort((a, b) => Number(b.prioritized) - Number(a.prioritized) || byPosition(a, b));
  const pool = views
    .filter((v) => v.open && !isOverdue(v, today) && v.plan && v.plan.grain !== 'day' && planContains(v.plan, today))
    .sort((a, b) => Number(a.plan?.grain === 'month') - Number(b.plan?.grain === 'month') || byPosition(a, b));

  return {
    today: todays,
    openToday: todays.filter((v) => v.open).length,
    overdue: views.filter((v) => isOverdue(v, today)).sort(byDue),
    slipped: views.filter((v) => isSlipped(v, today)).sort(byPlan),
    dueSoon: views
      .filter((v) => v.open && !v.plan && !v.task.later && !v.inQueue && v.task.dueDate !== null && today <= v.task.dueDate && v.task.dueDate < dueSoonEnd)
      .sort(byDue),
    pool,
    inboxCount: views.filter((v) => v.open && v.task.projectId === null).length,
    queues: queueSummaries(index),
  };
}

export interface WeekView {
  /** The week being planned: this week, or next week once it is nearly over. */
  start: LocalDate;
  days: { date: LocalDate; tasks: TaskView[] }[];
  /** Planned for the week, with no day yet. */
  week: TaskView[];
  inbox: TaskView[];
  /** Open tasks whose plan ended before the week starts. */
  carriedOver: TaskView[];
  /** Open, unplanned, due before the end of the week after. */
  dueSoon: TaskView[];
  /** Planned for the month the week starts in, with no week or day yet. */
  thisMonth: TaskView[];
}

/** The weekly sit-down. From the sixth day of a week on, it plans the next one. */
export function weekView(data: PlannerData, today: LocalDate, weekStartDay: IsoWeekday): WeekView {
  const index = new Index(data, today);
  const thisWeek = startOfWeek(today, weekStartDay);
  const start = toDayNumber(today) - toDayNumber(thisWeek) >= 5 ? addDays(thisWeek, 7) : thisWeek;
  const end = addDays(start, 7);
  const open = index
    .visibleTasks()
    .map((t) => index.view(t))
    .filter((v) => v.open);
  const dayTasks = (date: LocalDate) => open.filter((v) => v.plan?.grain === 'day' && v.plan.start === date).sort(byPosition);

  return {
    start,
    days: Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((date) => ({ date, tasks: dayTasks(date) })),
    week: open.filter((v) => v.plan?.grain === 'week' && v.plan.start === start).sort(byPosition),
    inbox: open.filter((v) => v.task.projectId === null && !v.plan).sort((a, b) => a.task.createdAt.localeCompare(b.task.createdAt)),
    carriedOver: open.filter((v) => v.plan && planEnd(v.plan) <= start).sort(byPlan),
    dueSoon: open
      .filter((v) => !v.plan && !v.task.later && !v.inQueue && v.task.projectId !== null && v.task.dueDate !== null && v.task.dueDate < addDays(end, 7))
      .sort(byDue),
    thisMonth: open.filter((v) => v.plan?.grain === 'month' && v.plan.start === startOfMonth(start)).sort(byPosition),
  };
}

/** A project's tasks in order: open ones first, then finished ones. */
export function projectTasks(projectId: string, data: PlannerData, today: LocalDate): TaskView[] {
  const index = new Index(data, today);
  const views = data.tasks.filter((t) => isLive(t) && t.projectId === projectId).map((t) => index.view(t));
  return [...views.filter((v) => v.open).sort(byPosition), ...views.filter((v) => !v.open).sort(byPosition)];
}

/** Open tasks in the Inbox, oldest first. */
export function inboxTasks(data: PlannerData, today: LocalDate): TaskView[] {
  const index = new Index(data, today);
  return data.tasks
    .filter((t) => isLive(t) && t.projectId === null)
    .map((t) => index.view(t))
    .filter((v) => v.open)
    .sort((a, b) => a.task.createdAt.localeCompare(b.task.createdAt));
}

/** The next task of a queue: its open task with the lowest position, or null when it is finished. */
export function queueNext(projectId: string, data: PlannerData, today: LocalDate): TaskView | null {
  return projectTasks(projectId, data, today).find((v) => v.open) ?? null;
}

export interface SessionView {
  session: SessionRow;
  items: { item: SessionItemRow; project: ProjectRow | null; current: TaskView | null; done: number; total: number }[];
  /** Tasks done in this session, in the order they were done. */
  done: TaskView[];
}

/** A Study-now session: what each source gives next, and what was done so far. */
export function sessionView(sessionId: string, data: PlannerData, today: LocalDate): SessionView | null {
  const session = data.sessions.find((s) => s.id === sessionId && isLive(s));
  if (!session) return null;
  const index = new Index(data, today);
  const items = data.sessionItems
    .filter((i) => i.sessionId === sessionId && isLive(i))
    .sort((a, b) => a.position - b.position)
    .map((item) => {
      if (item.projectId) {
        const tasks = projectTasks(item.projectId, data, today);
        const project = data.projects.find((p) => p.id === item.projectId) ?? null;
        return { item, project, current: tasks.find((v) => v.open) ?? null, done: tasks.filter((v) => v.status === 'done').length, total: tasks.length };
      }
      const task = data.tasks.find((t) => t.id === item.taskId && isLive(t));
      const view = task ? index.view(task) : null;
      return { item, project: view?.project ?? null, current: view?.open ? view : null, done: view?.status === 'done' ? 1 : 0, total: view ? 1 : 0 };
    });
  const done = data.taskRecords
    .filter((r) => r.sessionId === sessionId && isLive(r) && r.kind === 'done')
    .sort((a, b) => (a.occurredAt ?? '').localeCompare(b.occurredAt ?? ''))
    .flatMap((r) => {
      const task = data.tasks.find((t) => t.id === r.taskId && isLive(t));
      return task ? [index.view(task)] : [];
    });
  return { session, items, done };
}

function queueSummaries(index: Index): QueueSummary[] {
  return index.data.projects
    .filter((p) => p.mode === 'queue' && index.isVisibleProject(p))
    .sort((a, b) => a.position - b.position)
    .flatMap((project) => {
      const views = index.data.tasks.filter((t) => isLive(t) && t.projectId === project.id).map((t) => index.view(t));
      const next = views.filter((v) => v.open).sort(byPosition)[0];
      return next ? [{ project, next, done: views.filter((v) => v.status === 'done').length, total: views.length }] : [];
    });
}
