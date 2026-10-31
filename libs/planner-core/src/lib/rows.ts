import type { ChangeEntity, IsoWeekday, LocalDate, PlanGrain, ProjectMode, TaskRecordKind } from '@selah/shared-types';

// The planner rows as the app stores them (ADR 0029, 0033): the same shapes
// as the API's row DTOs, deleted rows included (ADR 0007). Timestamps are ISO
// strings; plan starts, due dates and record days are local calendar dates.

interface Row {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** A life domain. */
export interface AreaRow extends Row {
  name: string;
  position: number;
  archivedAt: string | null;
}

/** An optional layer between an area and its projects; groups can nest. */
export interface ProjectGroupRow extends Row {
  areaId: string;
  parentGroupId: string | null;
  name: string;
  position: number;
  archivedAt: string | null;
}

/** A container of tasks; a queue's tasks are done in order. */
export interface ProjectRow extends Row {
  areaId: string;
  groupId: string | null;
  name: string;
  mode: ProjectMode;
  position: number;
  archivedAt: string | null;
}

/** A task: a living plan. No project means the Inbox. */
export interface TaskRow extends Row {
  projectId: string | null;
  title: string;
  notes: string | null;
  position: number;
  dueDate: LocalDate | null;
  /** The plan's first day: the day itself, the week's first day, or the 1st of the month. */
  planStart: LocalDate | null;
  planGrain: PlanGrain | null;
  /** Unplanned on purpose: kept out of Due soon and the pool. */
  later: boolean;
  /** "Do this first today": prioritized only on this day. */
  prioritizedOn: LocalDate | null;
}

/** What happened to a task. */
export interface TaskRecordRow extends Row {
  taskId: string;
  kind: TaskRecordKind;
  /** The local day it happened. */
  occurredOn: LocalDate;
  /** The moment, when known; null for "done yesterday". */
  occurredAt: string | null;
  sessionId: string | null;
}

/** A Study-now block. */
export interface SessionRow extends Row {
  startedAt: string;
  endedAt: string | null;
}

/** What a session draws from: a queue (its next task) or one task. */
export interface SessionItemRow extends Row {
  sessionId: string;
  projectId: string | null;
  taskId: string | null;
  position: number;
}

/** One change to a task's plan or due date, or to a record, kept for reflecting later. */
export interface ChangeLogRow extends Row {
  entity: ChangeEntity;
  entityId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: string;
}

/** Every planner row the app holds. */
export interface PlannerData {
  areas: readonly AreaRow[];
  projectGroups: readonly ProjectGroupRow[];
  projects: readonly ProjectRow[];
  tasks: readonly TaskRow[];
  taskRecords: readonly TaskRecordRow[];
  sessions: readonly SessionRow[];
  sessionItems: readonly SessionItemRow[];
  changeLog: readonly ChangeLogRow[];
}

/** Rows to save after a change, by table. */
export interface PlannerChanges {
  areas?: AreaRow[];
  projectGroups?: ProjectGroupRow[];
  projects?: ProjectRow[];
  tasks?: TaskRow[];
  taskRecords?: TaskRecordRow[];
  sessions?: SessionRow[];
  sessionItems?: SessionItemRow[];
  changeLog?: ChangeLogRow[];
}

/** What every rule needs besides the rows: the clock and the week, read once by the caller. */
export interface PlannerContext {
  /** ISO timestamp for created, updated and changed times. */
  now: string;
  /** The device's local date. */
  today: LocalDate;
  /** The settings' first day of the week. */
  weekStartDay: IsoWeekday;
  /** Ids for rows the rule creates on its own, such as change-log rows. */
  newId: () => string;
}

export const isLive = (row: { deletedAt: string | null }): boolean => !row.deletedAt;
