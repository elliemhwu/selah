import { ConflictError, NotFoundError, RuleViolationError } from '@selah/shared-utils';
import {
  deleteRecord,
  editRecordDay,
  endSession,
  letGo,
  planTask,
  prioritizeTask,
  recordDone,
  recordWorkedOn,
  reopenTask,
  saveArea,
  saveProject,
  saveProjectGroup,
  saveTask,
  startSession,
} from './rules';
import { applied, area, context, data, project, record, session, task } from './testing';

const ctx = context();

function fieldErrors(run: () => unknown): Record<string, string[]> | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof RuleViolationError) return error.errors;
    throw error;
  }
  throw new Error('Expected a rule violation.');
}

describe('areas, groups and projects', () => {
  it('puts a new area last and keeps its place when renamed', () => {
    const rows = data({ areas: [area('a1', { position: 2 })] });
    expect(saveArea('a2', { name: ' 學習 ' }, rows, ctx).areas?.[0]).toMatchObject({ id: 'a2', name: '學習', position: 3 });
    expect(saveArea('a1', { name: '工作' }, rows, ctx).areas?.[0]).toMatchObject({ name: '工作', position: 2 });
  });

  it('needs a name', () => {
    expect(fieldErrors(() => saveArea('a2', { name: '  ' }, data(), ctx))).toHaveProperty('name');
  });

  it('keeps a group in its area and never inside itself', () => {
    const rows = data({
      areas: [area('a1'), area('a2')],
      projectGroups: [
        { id: 'g1', areaId: 'a1', parentGroupId: null, name: '華冠', position: 1, archivedAt: null, createdAt: '', updatedAt: '', deletedAt: null },
        { id: 'g2', areaId: 'a1', parentGroupId: 'g1', name: 'Team', position: 1, archivedAt: null, createdAt: '', updatedAt: '', deletedAt: null },
      ],
    });
    expect(fieldErrors(() => saveProjectGroup('g1', { areaId: 'a1', parentGroupId: 'g2', name: '華冠' }, rows, ctx))).toHaveProperty('parentGroupId');
    expect(fieldErrors(() => saveProjectGroup('g3', { areaId: 'a2', parentGroupId: 'g1', name: 'X' }, rows, ctx))).toHaveProperty('parentGroupId');
    expect(saveProjectGroup('g3', { areaId: 'a1', parentGroupId: 'g1', name: 'Church' }, rows, ctx).projectGroups?.[0]).toMatchObject({ parentGroupId: 'g1', position: 2 });
  });

  it('takes the plans off open tasks when a project becomes a queue', () => {
    const rows = data({
      tasks: [task('t1', { planStart: '2026-11-04', planGrain: 'day' }), task('t2', { planStart: '2026-11-02', planGrain: 'week' })],
      taskRecords: [record('r2', 't2')],
    });
    const changes = saveProject('p1', { areaId: 'a1', name: 'LeetCode', mode: 'queue' }, rows, ctx);
    expect(changes.projects?.[0].mode).toBe('queue');
    expect(changes.tasks).toEqual([expect.objectContaining({ id: 't1', planStart: null, planGrain: null })]);
    expect(changes.changeLog).toEqual([expect.objectContaining({ entityId: 't1', field: 'plan', oldValue: '2026-11-04/day', newValue: null })]);
  });
});

describe('tasks', () => {
  it('captures a task with only a title into the Inbox, last', () => {
    const rows = data({ tasks: [task('t1', { projectId: null, position: 4 })] });
    const created = saveTask('t2', { title: '寄場地清單給團隊' }, rows, ctx).tasks?.[0];
    expect(created).toMatchObject({ id: 't2', projectId: null, position: 5, planStart: null, later: false, createdAt: ctx.now });
  });

  it('normalizes the plan and logs plan and due-date changes, not the first ones', () => {
    const first = saveTask('t1', { title: 'Digest', projectId: 'p1', plan: { grain: 'week', start: '2026-11-05' }, dueDate: '2026-11-06' }, data(), ctx);
    expect(first.tasks?.[0]).toMatchObject({ planStart: '2026-11-02', planGrain: 'week', dueDate: '2026-11-06' });
    expect(first.changeLog).toBeUndefined();

    const rows = applied(data(), first);
    const changed = saveTask('t1', { title: 'Digest', plan: { grain: 'day', start: '2026-11-04' }, dueDate: '2026-11-07' }, rows, ctx);
    expect(changed.changeLog?.map((c) => [c.field, c.oldValue, c.newValue])).toEqual([
      ['plan', '2026-11-02/week', '2026-11-04/day'],
      ['due_date', '2026-11-06', '2026-11-07'],
    ]);
  });

  it('keeps the plan when the plan is left out', () => {
    const rows = data({ tasks: [task('t1', { planStart: '2026-11-04', planGrain: 'day' })] });
    const changes = saveTask('t1', { title: 'Renamed' }, rows, ctx);
    expect(changes.tasks?.[0]).toMatchObject({ title: 'Renamed', planStart: '2026-11-04' });
    expect(changes.changeLog).toBeUndefined();
  });

  it('refuses a plan for a queue task and clears the plan when a task moves into a queue', () => {
    const rows = data({ projects: [project('p1'), project('q1', { mode: 'queue' })], tasks: [task('t1', { planStart: '2026-11-04', planGrain: 'day' })] });
    expect(fieldErrors(() => saveTask('t2', { title: '#13', projectId: 'q1', plan: { grain: 'day', start: '2026-11-04' } }, rows, ctx))).toHaveProperty('plan');
    expect(saveTask('t1', { title: 't1', projectId: 'q1' }, rows, ctx).tasks?.[0]).toMatchObject({ projectId: 'q1', planStart: null });
    expect(fieldErrors(() => planTask('t2', { grain: 'day', start: '2026-11-04' }, applied(rows, { tasks: [task('t2', { projectId: 'q1' })] }), ctx))).toHaveProperty('plan');
  });

  it('checks the title, the project and the dates', () => {
    const errors = fieldErrors(() => saveTask('t1', { title: ' ', projectId: 'nope', dueDate: '2026-02-30', plan: { grain: 'day', start: 'soon' } }, data(), ctx));
    expect(Object.keys(errors ?? {}).sort()).toEqual(['dueDate', 'plan', 'projectId', 'title']);
  });

  it('sets a task aside for later, which clears its plan', () => {
    const rows = data({ tasks: [task('t1', { planStart: '2026-11-04', planGrain: 'day' })] });
    const changes = planTask('t1', 'later', rows, ctx);
    expect(changes.tasks?.[0]).toMatchObject({ planStart: null, planGrain: null, later: true });
    expect(changes.changeLog?.[0]).toMatchObject({ oldValue: '2026-11-04/day', newValue: 'later' });
    expect(planTask('t1', { grain: 'day', start: '2026-11-05' }, applied(rows, changes), ctx).tasks?.[0]).toMatchObject({ later: false, planStart: '2026-11-05' });
  });

  it('prioritizes a task for today only', () => {
    const rows = data({ tasks: [task('t1')] });
    expect(prioritizeTask('t1', true, rows, ctx).tasks?.[0].prioritizedOn).toBe('2026-11-03');
    expect(prioritizeTask('t1', false, rows, ctx).tasks?.[0].prioritizedOn).toBeNull();
  });

  it("can't change a deleted task", () => {
    const rows = data({ tasks: [task('t1', { deletedAt: ctx.now })] });
    expect(() => saveTask('t1', { title: 'x' }, rows, ctx)).toThrow(ConflictError);
    expect(() => planTask('t9', null, rows, ctx)).toThrow(NotFoundError);
  });
});

describe('records', () => {
  it('records done now, or on an earlier day without a time', () => {
    const rows = data({ tasks: [task('t1')] });
    expect(recordDone('r1', 't1', rows, ctx).taskRecords?.[0]).toMatchObject({ kind: 'done', occurredOn: '2026-11-03', occurredAt: ctx.now });
    expect(recordDone('r1', 't1', rows, ctx, { on: '2026-11-02' }).taskRecords?.[0]).toMatchObject({ occurredOn: '2026-11-02', occurredAt: null });
    expect(fieldErrors(() => recordDone('r1', 't1', rows, ctx, { on: '2026-11-04' }))).toHaveProperty('occurredOn');
  });

  it('replaces let go with done, and leaves a second done alone', () => {
    const rows = data({ tasks: [task('t1')], taskRecords: [record('r1', 't1', { kind: 'let_go' })] });
    const changes = recordDone('r2', 't1', rows, ctx);
    expect(changes.taskRecords?.map((r) => [r.id, r.kind, r.deletedAt])).toEqual([
      ['r1', 'let_go', ctx.now],
      ['r2', 'done', null],
    ]);
    expect(recordDone('r3', 't1', applied(rows, changes), ctx)).toEqual({});
  });

  it('reopens a task by soft-deleting its done record, and logs it', () => {
    const rows = data({ tasks: [task('t1')], taskRecords: [record('r1', 't1')] });
    const changes = reopenTask('t1', rows, ctx);
    expect(changes.taskRecords?.[0]).toMatchObject({ id: 'r1', deletedAt: ctx.now });
    expect(changes.changeLog?.[0]).toMatchObject({ entity: 'task_record', entityId: 'r1', field: 'deleted', oldValue: 'done', newValue: null });
  });

  it('records work on a task and plans it for tomorrow by default', () => {
    const rows = data({ tasks: [task('t1', { planStart: '2026-11-03', planGrain: 'day' })] });
    const changes = recordWorkedOn('r1', 't1', rows, ctx);
    expect(changes.taskRecords?.[0]).toMatchObject({ kind: 'worked_on', occurredOn: '2026-11-03' });
    expect(changes.tasks?.[0]).toMatchObject({ planStart: '2026-11-04', planGrain: 'day' });
    expect(recordWorkedOn('r1', 't1', rows, ctx, { next: 'later' }).tasks?.[0]).toMatchObject({ later: true, planStart: null });
  });

  it('keeps a queue task at the front when worked on, with no plan', () => {
    const rows = data({ projects: [project('q1', { mode: 'queue' })], tasks: [task('t1', { projectId: 'q1' })] });
    const changes = recordWorkedOn('r1', 't1', rows, ctx);
    expect(changes.tasks).toBeUndefined();
    expect(changes.taskRecords).toHaveLength(1);
  });

  it("can't work on a finished task", () => {
    const rows = data({ tasks: [task('t1')], taskRecords: [record('r1', 't1')] });
    expect(() => recordWorkedOn('r2', 't1', rows, ctx)).toThrow(ConflictError);
  });

  it('corrects a done day and logs it; deletes a record and logs it', () => {
    const rows = data({ tasks: [task('t1')], taskRecords: [record('r1', 't1', { occurredOn: '2026-11-03', occurredAt: ctx.now })] });
    const edited = editRecordDay('r1', '2026-11-02', rows, ctx);
    expect(edited.taskRecords?.[0]).toMatchObject({ occurredOn: '2026-11-02', occurredAt: null });
    expect(edited.changeLog?.[0]).toMatchObject({ field: 'occurred_on', oldValue: '2026-11-03', newValue: '2026-11-02' });
    expect(deleteRecord('r1', rows, ctx).changeLog?.[0]).toMatchObject({ field: 'deleted' });
  });

  it('records let go', () => {
    expect(letGo('r1', 't1', data({ tasks: [task('t1')] }), ctx).taskRecords?.[0].kind).toBe('let_go');
  });
});

describe('sessions', () => {
  const rows = data({ projects: [project('q1', { mode: 'queue' }), project('p1')], tasks: [task('t1')] });

  it('starts a session from queues and tasks', () => {
    const changes = startSession('s1', [{ projectId: 'q1' }, { taskId: 't1' }], rows, ctx);
    expect(changes.sessions).toEqual([expect.objectContaining({ id: 's1', startedAt: ctx.now, endedAt: null })]);
    expect(changes.sessionItems?.map((i) => [i.projectId, i.taskId, i.position])).toEqual([
      ['q1', null, 1],
      [null, 't1', 2],
    ]);
  });

  it('only takes queues and open tasks', () => {
    expect(fieldErrors(() => startSession('s1', [{ projectId: 'p1' }], rows, ctx))).toHaveProperty(['sources.0']);
    expect(fieldErrors(() => startSession('s1', [], rows, ctx))).toHaveProperty('sources');
  });

  it('closes a session left open at its last record', () => {
    const open = applied(rows, {
      sessions: [session('s0')],
      taskRecords: [record('r1', 't1', { sessionId: 's0', occurredAt: '2026-11-03T12:40:00.000Z' })],
    });
    const changes = startSession('s1', [{ projectId: 'q1' }], open, ctx);
    expect(changes.sessions?.[0]).toMatchObject({ id: 's0', endedAt: '2026-11-03T12:40:00.000Z' });
    expect(endSession('s1', applied(open, changes), ctx).sessions?.[0]).toMatchObject({ endedAt: ctx.now });
  });
});
