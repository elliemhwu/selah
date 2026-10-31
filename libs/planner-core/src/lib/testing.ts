import type { AreaRow, PlannerContext, PlannerData, ProjectRow, SessionRow, TaskRecordRow, TaskRow } from './rows';

// Rows and a context for the tests. Today is Tue 3 Nov 2026; weeks start on Monday.

const T = '2026-10-01T00:00:00.000Z';
const base = { createdAt: T, updatedAt: T, deletedAt: null };

export const area = (id: string, over: Partial<AreaRow> = {}): AreaRow => ({ id, name: id, position: 1, archivedAt: null, ...base, ...over });
export const project = (id: string, over: Partial<ProjectRow> = {}): ProjectRow => ({
  id,
  areaId: 'a1',
  groupId: null,
  name: id,
  mode: 'list',
  position: 1,
  archivedAt: null,
  ...base,
  ...over,
});
export const task = (id: string, over: Partial<TaskRow> = {}): TaskRow => ({
  id,
  projectId: 'p1',
  title: id,
  notes: null,
  position: 1,
  dueDate: null,
  planStart: null,
  planGrain: null,
  later: false,
  prioritizedOn: null,
  ...base,
  ...over,
});
export const record = (id: string, taskId: string, over: Partial<TaskRecordRow> = {}): TaskRecordRow => ({
  id,
  taskId,
  kind: 'done',
  occurredOn: '2026-11-03',
  occurredAt: null,
  sessionId: null,
  ...base,
  ...over,
});
export const session = (id: string, over: Partial<SessionRow> = {}): SessionRow => ({ id, startedAt: '2026-11-03T12:00:00.000Z', endedAt: null, ...base, ...over });

export const data = (over: Partial<PlannerData> = {}): PlannerData => ({
  areas: [area('a1')],
  projectGroups: [],
  projects: [project('p1')],
  tasks: [],
  taskRecords: [],
  sessions: [],
  sessionItems: [],
  changeLog: [],
  ...over,
});

/** A context on `today`, with ids x1, x2, … for the rows a rule creates. */
export function context(today = '2026-11-03', now = `${today}T13:40:00.000Z`): PlannerContext {
  let n = 0;
  return { now, today, weekStartDay: 1, newId: () => `x${++n}` };
}

/** The rows after applying a rule's changes, as the device store does. */
export function applied(before: PlannerData, changes: Partial<Record<keyof PlannerData, readonly { id: string }[]>>): PlannerData {
  const next: Record<string, readonly { id: string }[]> = { ...before };
  for (const [table, rows] of Object.entries(changes)) {
    const byId = new Map((next[table] ?? []).map((r) => [r.id, r]));
    for (const row of rows ?? []) byId.set(row.id, row);
    next[table] = [...byId.values()];
  }
  return next as unknown as PlannerData;
}
