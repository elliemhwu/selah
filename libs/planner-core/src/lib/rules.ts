import { type LocalDate, PROJECT_MODES, type ProjectMode, type TaskRecordKind } from '@selah/shared-types';
import { addDays, ConflictError, DateError, FieldErrorCollector, NotFoundError, toDayNumber } from '@selah/shared-utils';
import { isPlanGrain, normalizePlan, type Plan, planOf, planText } from './plan';
import { positionAtEnd, positionBetween } from './position';
import {
  type ChangeLogRow,
  isLive,
  type PlannerChanges,
  type PlannerContext,
  type PlannerData,
  type ProjectGroupRow,
  type ProjectRow,
  type SessionItemRow,
  type SessionRow,
  type TaskRecordRow,
  type TaskRow,
} from './rows';

// The planner rules (ADR 0033). Each one checks a change against the rows the
// app holds and returns every row to save, change-log rows included, or
// throws RuleViolationError (with field errors), ConflictError or
// NotFoundError. Callers pass the ids of rows they create (ADR 0007).

export const MAX_NAME_LENGTH = 100;
export const MAX_TITLE_LENGTH = 300;
export const MAX_NOTES_LENGTH = 5000;

/** Where a task's plan goes: a period, "later" (unplanned on purpose), or no plan. */
export type PlanChoice = Plan | 'later' | null;

// ---- Areas, groups and projects ---------------------------------------------

export interface AreaInput {
  name: string;
}

/** Creates or renames an area; a new one goes last. */
export function saveArea(id: string, input: AreaInput, data: PlannerData, ctx: PlannerContext): PlannerChanges {
  const existing = liveOrNew(data.areas, id, 'This area was deleted.');
  const errors = new FieldErrorCollector();
  const name = checkName(input.name, 'Name the area.', errors);
  errors.throwIfAny("The area can't be saved.");
  const position = existing?.position ?? positionAtEnd(data.areas.filter(isLive));
  return { areas: [upsert(existing, id, { name, position, archivedAt: existing?.archivedAt ?? null }, ctx)] };
}

export interface ProjectGroupInput {
  areaId: string;
  parentGroupId?: string | null;
  name: string;
}

/** Creates or changes a group. A group stays in one area and is never inside itself. */
export function saveProjectGroup(id: string, input: ProjectGroupInput, data: PlannerData, ctx: PlannerContext): PlannerChanges {
  const existing = liveOrNew(data.projectGroups, id, 'This group was deleted.');
  const parentGroupId = input.parentGroupId ?? null;
  const errors = new FieldErrorCollector();
  const name = checkName(input.name, 'Name the group.', errors);
  checkLive(data.areas, input.areaId, 'areaId', "That area doesn't exist.", errors);
  if (parentGroupId !== null) {
    const parent = data.projectGroups.find((g) => g.id === parentGroupId && isLive(g));
    if (!parent) errors.add('parentGroupId', "That group doesn't exist.");
    else if (parent.areaId !== input.areaId) errors.add('parentGroupId', 'A group sits inside a group of the same area.');
    else if (groupAncestors(parentGroupId, data).includes(id)) errors.add('parentGroupId', "A group can't be inside itself.");
  }
  errors.throwIfAny("The group can't be saved.");
  const siblings = data.projectGroups.filter((g) => isLive(g) && g.areaId === input.areaId && g.parentGroupId === parentGroupId);
  const position = existing?.position ?? positionAtEnd(siblings);
  return {
    projectGroups: [upsert(existing, id, { areaId: input.areaId, parentGroupId, name, position, archivedAt: existing?.archivedAt ?? null }, ctx)],
  };
}

export interface ProjectInput {
  areaId: string;
  groupId?: string | null;
  name: string;
  mode?: ProjectMode;
}

/** Creates or changes a project. Turning it into a queue takes the plans off its open tasks. */
export function saveProject(id: string, input: ProjectInput, data: PlannerData, ctx: PlannerContext): PlannerChanges {
  const existing = liveOrNew(data.projects, id, 'This project was deleted.');
  const groupId = input.groupId ?? null;
  const mode = input.mode ?? existing?.mode ?? 'list';
  const errors = new FieldErrorCollector();
  const name = checkName(input.name, 'Name the project.', errors);
  checkLive(data.areas, input.areaId, 'areaId', "That area doesn't exist.", errors);
  if (groupId !== null) {
    const group = data.projectGroups.find((g) => g.id === groupId && isLive(g));
    if (!group) errors.add('groupId', "That group doesn't exist.");
    else if (group.areaId !== input.areaId) errors.add('groupId', 'Choose a group in the same area.');
  }
  if (!PROJECT_MODES.includes(mode)) errors.add('mode', 'Choose a list or a queue.');
  errors.throwIfAny("The project can't be saved.");

  const position = existing?.position ?? positionAtEnd(data.projects.filter((p) => isLive(p) && p.areaId === input.areaId));
  const project = upsert(existing, id, { areaId: input.areaId, groupId, name, mode, position, archivedAt: existing?.archivedAt ?? null }, ctx);
  if (mode !== 'queue') return { projects: [project] };

  const changes = new ChangeSet(ctx);
  changes.projects.push(project);
  const ended = endedTaskIds(data);
  for (const task of data.tasks) {
    if (task.projectId === id && isLive(task) && !ended.has(task.id)) changes.replan(task, null);
  }
  return changes.result();
}

/** Archives or restores a project; archived projects leave every view. */
export function archiveProject(id: string, archived: boolean, data: PlannerData, ctx: PlannerContext): PlannerChanges {
  const project = findLive(data.projects, id, 'Project');
  return { projects: [{ ...project, archivedAt: archived ? (project.archivedAt ?? ctx.now) : null, updatedAt: ctx.now }] };
}

// ---- Tasks ------------------------------------------------------------------

export interface TaskInput {
  title: string;
  notes?: string | null;
  /** Null puts it in the Inbox. */
  projectId?: string | null;
  dueDate?: LocalDate | null;
  /** Leave out to keep the plan as it is. */
  plan?: PlanChoice;
  /** Leave out to keep the order, or to put a new task last. */
  position?: number;
}

/**
 * Creates or changes a task. A task in a queue never has a plan, so moving it
 * into one clears its plan. Plan and due-date changes go to the change log.
 */
export function saveTask(id: string, input: TaskInput, data: PlannerData, ctx: PlannerContext): PlannerChanges {
  const existing = liveOrNew(data.tasks, id, 'This task was deleted.');
  const projectId = input.projectId === undefined ? (existing?.projectId ?? null) : input.projectId;
  const dueDate = input.dueDate === undefined ? (existing?.dueDate ?? null) : input.dueDate;
  const errors = new FieldErrorCollector();
  const title = input.title.trim();
  if (title === '') errors.add('title', 'Write what the task is.');
  else if (title.length > MAX_TITLE_LENGTH) errors.add('title', `Keep the title to ${MAX_TITLE_LENGTH} characters.`);
  const notes = input.notes === undefined ? (existing?.notes ?? null) : input.notes?.trim() || null;
  if (notes && notes.length > MAX_NOTES_LENGTH) errors.add('notes', `Keep the notes to ${MAX_NOTES_LENGTH} characters.`);
  let project: ProjectRow | undefined;
  if (projectId !== null) {
    project = data.projects.find((p) => p.id === projectId && isLive(p));
    if (!project) errors.add('projectId', "That project doesn't exist.");
  }
  if (dueDate !== null && !isLocalDate(dueDate)) errors.add('dueDate', 'Enter a date.');
  const inQueue = project?.mode === 'queue';
  let plan = input.plan;
  if (plan !== undefined && plan !== null && plan !== 'later') {
    if (inQueue) errors.add('plan', "Tasks in a queue are done in order, so they don't get a plan.");
    else plan = checkPlan(plan, ctx, errors);
  }
  errors.throwIfAny("The task can't be saved.");

  const siblings = data.tasks.filter((t) => isLive(t) && t.projectId === projectId && t.id !== id);
  const movedList = existing && existing.projectId !== projectId;
  const position = input.position ?? (existing && !movedList ? existing.position : positionAtEnd(siblings));
  const current: PlanChoice = existing ? currentPlan(existing) : null;
  const nextPlan: PlanChoice = inQueue ? null : plan === undefined ? current : plan;

  const changes = new ChangeSet(ctx);
  const values = { projectId, title, notes, position, dueDate, prioritizedOn: existing?.prioritizedOn ?? null, ...planColumns(nextPlan) };
  const task = upsert(existing, id, values, ctx);
  if (existing) {
    changes.log('task', id, 'plan', planText(planOf(existing), existing.later), planText(planOf(task), task.later));
    changes.log('task', id, 'due_date', existing.dueDate, task.dueDate);
  }
  changes.tasks.push(task);
  return changes.result();
}

/** Gives a task a plan, sets it aside for later, or takes its plan away. */
export function planTask(id: string, plan: PlanChoice, data: PlannerData, ctx: PlannerContext): PlannerChanges {
  const task = findLive(data.tasks, id, 'Task');
  const errors = new FieldErrorCollector();
  if (plan !== null && plan !== 'later') {
    if (inQueue(task, data)) errors.add('plan', "Tasks in a queue are done in order, so they don't get a plan.");
    else plan = checkPlan(plan, ctx, errors);
  }
  errors.throwIfAny("The plan can't be saved.");
  const changes = new ChangeSet(ctx);
  changes.replan(task, plan);
  return changes.result();
}

/** "Do this first today", or not. It lasts only for today. */
export function prioritizeTask(id: string, prioritized: boolean, data: PlannerData, ctx: PlannerContext): PlannerChanges {
  const task = findLive(data.tasks, id, 'Task');
  return { tasks: [{ ...task, prioritizedOn: prioritized ? ctx.today : null, updatedAt: ctx.now }] };
}

/** Soft-deletes a task. Its records stay, for its history. */
export function deleteTask(id: string, data: PlannerData, ctx: PlannerContext): PlannerChanges {
  const task = data.tasks.find((t) => t.id === id);
  if (!task) throw new NotFoundError(`Task ${id} not found.`);
  if (!isLive(task)) return {};
  return { tasks: [{ ...task, updatedAt: ctx.now, deletedAt: ctx.now }] };
}

/**
 * Moves a task to just after `afterId` in its list (null puts it first). Only
 * the moved task changes: it takes the midpoint of its new neighbours.
 */
export function moveTask(id: string, afterId: string | null, data: PlannerData, ctx: PlannerContext): PlannerChanges {
  const task = findLive(data.tasks, id, 'Task');
  const siblings = data.tasks
    .filter((t) => isLive(t) && t.projectId === task.projectId && t.id !== id)
    .sort((a, b) => a.position - b.position);
  const index = afterId === null ? -1 : siblings.findIndex((t) => t.id === afterId);
  if (afterId !== null && index === -1) throw new NotFoundError(`Task ${afterId} not found in this list.`);
  const position = positionBetween(siblings[index]?.position ?? null, siblings[index + 1]?.position ?? null);
  if (position === task.position) return {};
  return { tasks: [{ ...task, position, updatedAt: ctx.now }] };
}

/**
 * Starts a project over as a new one, such as reading a book again: the same
 * area, group and mode, and a fresh open copy of each task in the same order.
 * Plans, due dates and records stay with the original.
 */
export function copyProject(newId: string, sourceId: string, name: string, data: PlannerData, ctx: PlannerContext): PlannerChanges {
  const source = findLive(data.projects, sourceId, 'Project');
  if (data.projects.some((p) => p.id === newId)) throw new ConflictError('This project already exists.');
  const errors = new FieldErrorCollector();
  const checked = checkName(name, 'Name the project.', errors);
  errors.throwIfAny("The project can't be copied.");
  const siblings = data.projects.filter((p) => isLive(p) && p.areaId === source.areaId && p.groupId === source.groupId);
  const project: ProjectRow = {
    ...source,
    id: newId,
    name: checked,
    position: positionAtEnd(siblings),
    archivedAt: null,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deletedAt: null,
  };
  const tasks = data.tasks
    .filter((t) => isLive(t) && t.projectId === sourceId)
    .sort((a, b) => a.position - b.position)
    .map((t): TaskRow => ({
      id: ctx.newId(),
      projectId: newId,
      title: t.title,
      notes: t.notes,
      position: t.position,
      dueDate: null,
      planStart: null,
      planGrain: null,
      later: false,
      prioritizedOn: null,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      deletedAt: null,
    }));
  return tasks.length ? { projects: [project], tasks } : { projects: [project] };
}

// ---- Records ----------------------------------------------------------------

export interface DoneOptions {
  /** The day it was done, for "done yesterday"; leave out for now. */
  on?: LocalDate;
  sessionId?: string | null;
}

/** Records a task as done. A let-go record it had is replaced. */
export function recordDone(recordId: string, taskId: string, data: PlannerData, ctx: PlannerContext, options: DoneOptions = {}): PlannerChanges {
  return recordOutcome(recordId, taskId, 'done', data, ctx, options);
}

/** Records that I chose not to do a task: cancelled or abandoned. */
export function letGo(recordId: string, taskId: string, data: PlannerData, ctx: PlannerContext): PlannerChanges {
  return recordOutcome(recordId, taskId, 'let_go', data, ctx, {});
}

/** Takes back a task's done or let-go record, so it is open again. */
export function reopenTask(taskId: string, data: PlannerData, ctx: PlannerContext): PlannerChanges {
  findLive(data.tasks, taskId, 'Task');
  const outcome = data.taskRecords.find((r) => r.taskId === taskId && isLive(r) && r.kind !== 'worked_on');
  if (!outcome) return {};
  const changes = new ChangeSet(ctx);
  changes.removeRecord(outcome);
  return changes.result();
}

export interface WorkedOnOptions {
  /** When I'll touch it next; leave out for tomorrow. Ignored for queue tasks, which stay at the front. */
  next?: PlanChoice;
  sessionId?: string | null;
}

/** Records work on a task that isn't finished, and plans the next time I'll touch it. */
export function recordWorkedOn(recordId: string, taskId: string, data: PlannerData, ctx: PlannerContext, options: WorkedOnOptions = {}): PlannerChanges {
  const task = findLive(data.tasks, taskId, 'Task');
  if (endedTaskIds(data).has(taskId)) throw new ConflictError('This task is already finished.');
  checkSession(options.sessionId ?? null, data);
  const changes = new ChangeSet(ctx);
  changes.taskRecords.push(newRecord(recordId, taskId, 'worked_on', ctx.today, ctx.now, options.sessionId ?? null, ctx));
  if (!inQueue(task, data)) {
    let next = options.next === undefined ? { grain: 'day' as const, start: addDays(ctx.today, 1) } : options.next;
    if (next !== null && next !== 'later') {
      const errors = new FieldErrorCollector();
      next = checkPlan(next, ctx, errors);
      errors.throwIfAny("The plan can't be saved.");
    }
    changes.replan(task, next);
  }
  return changes.result();
}

/** Corrects the day a record happened, such as a done date. */
export function editRecordDay(recordId: string, occurredOn: LocalDate, data: PlannerData, ctx: PlannerContext): PlannerChanges {
  const record = findLive(data.taskRecords, recordId, 'Record');
  const errors = new FieldErrorCollector();
  checkPastDay(occurredOn, ctx, errors);
  errors.throwIfAny("The record can't be saved.");
  if (record.occurredOn === occurredOn) return {};
  const changes = new ChangeSet(ctx);
  changes.taskRecords.push({ ...record, occurredOn, occurredAt: null, updatedAt: ctx.now });
  changes.log('task_record', recordId, 'occurred_on', record.occurredOn, occurredOn);
  return changes.result();
}

/** Takes back one record. */
export function deleteRecord(recordId: string, data: PlannerData, ctx: PlannerContext): PlannerChanges {
  const record = data.taskRecords.find((r) => r.id === recordId);
  if (!record) throw new NotFoundError(`Record ${recordId} not found.`);
  if (!isLive(record)) return {};
  const changes = new ChangeSet(ctx);
  changes.removeRecord(record);
  return changes.result();
}

// ---- Study now --------------------------------------------------------------

/** One thing a session draws from: a queue (its next task) or one task. */
export type SessionSource = { projectId: string } | { taskId: string };

/**
 * Starts a Study-now session. A session still open is closed first, at the
 * time of its last record (or its start, if nothing was recorded).
 */
export function startSession(sessionId: string, sources: readonly SessionSource[], data: PlannerData, ctx: PlannerContext): PlannerChanges {
  if (data.sessions.some((s) => s.id === sessionId)) throw new ConflictError('This session already exists.');
  const errors = new FieldErrorCollector();
  if (sources.length === 0) errors.add('sources', 'Choose a queue or a task to study.');
  const ended = endedTaskIds(data);
  sources.forEach((source, i) => {
    if ('projectId' in source) {
      const project = data.projects.find((p) => p.id === source.projectId && isLive(p));
      if (!project) errors.add(`sources.${i}`, "That queue doesn't exist.");
      else if (project.mode !== 'queue') errors.add(`sources.${i}`, 'Only a queue gives its next task.');
    } else {
      const task = data.tasks.find((t) => t.id === source.taskId && isLive(t));
      if (!task) errors.add(`sources.${i}`, "That task doesn't exist.");
      else if (ended.has(task.id)) errors.add(`sources.${i}`, 'That task is already finished.');
    }
  });
  errors.throwIfAny("The session can't start.");

  const sessions: SessionRow[] = data.sessions.filter((s) => isLive(s) && s.endedAt === null).map((s) => ({ ...s, endedAt: lastActivity(s, data), updatedAt: ctx.now }));
  sessions.push({ id: sessionId, startedAt: ctx.now, endedAt: null, createdAt: ctx.now, updatedAt: ctx.now, deletedAt: null });
  const sessionItems: SessionItemRow[] = sources.map((source, i) => ({
    id: ctx.newId(),
    sessionId,
    projectId: 'projectId' in source ? source.projectId : null,
    taskId: 'taskId' in source ? source.taskId : null,
    position: i + 1,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deletedAt: null,
  }));
  return { sessions, sessionItems };
}

/** Ends a session now. */
export function endSession(sessionId: string, data: PlannerData, ctx: PlannerContext): PlannerChanges {
  const session = findLive(data.sessions, sessionId, 'Session');
  if (session.endedAt !== null) return {};
  return { sessions: [{ ...session, endedAt: ctx.now, updatedAt: ctx.now }] };
}

// ---- Shared helpers ---------------------------------------------------------

/** Task ids with a live done or let-go record. */
export function endedTaskIds(data: PlannerData): Set<string> {
  return new Set(data.taskRecords.filter((r) => isLive(r) && r.kind !== 'worked_on').map((r) => r.taskId));
}

/** Collects the rows a rule saves, with their change-log rows. */
class ChangeSet {
  readonly projects: ProjectRow[] = [];
  readonly tasks: TaskRow[] = [];
  readonly taskRecords: TaskRecordRow[] = [];
  readonly changeLog: ChangeLogRow[] = [];

  constructor(private readonly ctx: PlannerContext) {}

  /** Changes a task's plan and logs it. */
  replan(task: TaskRow, plan: PlanChoice): void {
    const next = { ...task, ...planColumns(plan), updatedAt: this.ctx.now };
    this.log('task', task.id, 'plan', planText(planOf(task), task.later), planText(planOf(next), next.later));
    this.tasks.push(next);
  }

  /** Soft-deletes a record and logs it. */
  removeRecord(record: TaskRecordRow): void {
    this.taskRecords.push({ ...record, updatedAt: this.ctx.now, deletedAt: this.ctx.now });
    this.log('task_record', record.id, 'deleted', record.kind, null);
  }

  log(entity: ChangeLogRow['entity'], entityId: string, field: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;
    const { now } = this.ctx;
    this.changeLog.push({ id: this.ctx.newId(), entity, entityId, field, oldValue, newValue, changedAt: now, createdAt: now, updatedAt: now, deletedAt: null });
  }

  result(): PlannerChanges {
    const out: PlannerChanges = {};
    if (this.projects.length) out.projects = this.projects;
    if (this.tasks.length) out.tasks = this.tasks;
    if (this.taskRecords.length) out.taskRecords = this.taskRecords;
    if (this.changeLog.length) out.changeLog = this.changeLog;
    return out;
  }
}

function recordOutcome(
  recordId: string,
  taskId: string,
  kind: Extract<TaskRecordKind, 'done' | 'let_go'>,
  data: PlannerData,
  ctx: PlannerContext,
  options: DoneOptions,
): PlannerChanges {
  findLive(data.tasks, taskId, 'Task');
  const errors = new FieldErrorCollector();
  if (options.on !== undefined) checkPastDay(options.on, ctx, errors);
  errors.throwIfAny("The task can't be recorded.");
  checkSession(options.sessionId ?? null, data);
  const changes = new ChangeSet(ctx);
  const previous = data.taskRecords.find((r) => r.taskId === taskId && isLive(r) && r.kind !== 'worked_on');
  if (previous?.kind === kind) return {};
  if (previous) changes.removeRecord(previous);
  const occurredOn = options.on ?? ctx.today;
  changes.taskRecords.push(newRecord(recordId, taskId, kind, occurredOn, options.on === undefined ? ctx.now : null, options.sessionId ?? null, ctx));
  return changes.result();
}

function newRecord(id: string, taskId: string, kind: TaskRecordKind, occurredOn: LocalDate, occurredAt: string | null, sessionId: string | null, ctx: PlannerContext): TaskRecordRow {
  return { id, taskId, kind, occurredOn, occurredAt, sessionId, createdAt: ctx.now, updatedAt: ctx.now, deletedAt: null };
}

function planColumns(plan: PlanChoice): Pick<TaskRow, 'planStart' | 'planGrain' | 'later'> {
  if (plan === 'later') return { planStart: null, planGrain: null, later: true };
  if (plan === null) return { planStart: null, planGrain: null, later: false };
  return { planStart: plan.start, planGrain: plan.grain, later: false };
}

function currentPlan(task: TaskRow): PlanChoice {
  return planOf(task) ?? (task.later ? 'later' : null);
}

function inQueue(task: TaskRow, data: PlannerData): boolean {
  return task.projectId !== null && data.projects.some((p) => p.id === task.projectId && p.mode === 'queue');
}

function checkPlan(plan: Plan, ctx: PlannerContext, errors: FieldErrorCollector): Plan {
  if (!isPlanGrain(plan.grain)) {
    errors.add('plan', 'Choose a day, a week or a month.');
    return plan;
  }
  if (!isLocalDate(plan.start)) {
    errors.add('plan', 'Enter a date.');
    return plan;
  }
  return normalizePlan(plan, ctx.weekStartDay);
}

function checkPastDay(day: LocalDate, ctx: PlannerContext, errors: FieldErrorCollector): void {
  if (!isLocalDate(day)) errors.add('occurredOn', 'Enter a date.');
  else if (day > ctx.today) errors.add('occurredOn', "It can't be done in the future.");
}

function checkSession(sessionId: string | null, data: PlannerData): void {
  if (sessionId !== null && !data.sessions.some((s) => s.id === sessionId && isLive(s))) throw new NotFoundError(`Session ${sessionId} not found.`);
}

function checkName(value: string, emptyMessage: string, errors: FieldErrorCollector): string {
  const name = value.trim();
  if (name === '') errors.add('name', emptyMessage);
  else if (name.length > MAX_NAME_LENGTH) errors.add('name', `Keep the name to ${MAX_NAME_LENGTH} characters.`);
  return name;
}

function lastActivity(session: SessionRow, data: PlannerData): string {
  const times = data.taskRecords.filter((r) => r.sessionId === session.id && isLive(r) && r.occurredAt).map((r) => r.occurredAt as string);
  return times.reduce((latest, t) => (t > latest ? t : latest), session.startedAt);
}

function groupAncestors(groupId: string, data: PlannerData): string[] {
  const ids: string[] = [];
  let current: ProjectGroupRow | undefined = data.projectGroups.find((g) => g.id === groupId);
  while (current && !ids.includes(current.id)) {
    ids.push(current.id);
    current = current.parentGroupId ? data.projectGroups.find((g) => g.id === current?.parentGroupId) : undefined;
  }
  return ids;
}

/** The row with this id if it exists, or undefined for a new one; a deleted row can't be changed. */
function liveOrNew<T extends { id: string; deletedAt: string | null }>(rows: readonly T[], id: string, deletedMessage: string): T | undefined {
  const existing = rows.find((r) => r.id === id);
  if (existing && !isLive(existing)) throw new ConflictError(deletedMessage);
  return existing;
}

function findLive<T extends { id: string; deletedAt: string | null }>(rows: readonly T[], id: string, what: string): T {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new NotFoundError(`${what} ${id} not found.`);
  if (!isLive(row)) throw new ConflictError(`This ${what.toLowerCase()} was deleted.`);
  return row;
}

function checkLive(rows: readonly { id: string; deletedAt: string | null }[], id: string, field: string, message: string, errors: FieldErrorCollector): void {
  if (!rows.some((r) => r.id === id && isLive(r))) errors.add(field, message);
}

function upsert<T extends { id: string; createdAt: string; updatedAt: string; deletedAt: string | null }>(
  existing: T | undefined,
  id: string,
  values: Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
  ctx: PlannerContext,
): T {
  return { ...(existing ?? { id, createdAt: ctx.now, deletedAt: null }), ...values, updatedAt: ctx.now } as T;
}

function isLocalDate(value: string): boolean {
  try {
    toDayNumber(value);
    return true;
  } catch (error) {
    if (error instanceof DateError) return false;
    throw error;
  }
}

