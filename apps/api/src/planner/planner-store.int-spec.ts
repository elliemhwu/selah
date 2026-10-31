import { createTestApp, newId, resetDatabase, type TestApp } from '../testing/test-app';

const BASE = '/api/v1/store';

// The planner tables in the row store (ADR 0029, 0033). Timestamps are the client's own.
const T1 = '2026-11-02T08:00:00.000Z';
const T2 = '2026-11-03T13:40:00.250Z';
const base = { createdAt: T1, updatedAt: T1, deletedAt: null };

const area = (over: object = {}) => ({ id: newId(), name: '學習', position: 1, archivedAt: null, ...base, ...over });
const group = (areaId: string, over: object = {}) => ({
  id: newId(),
  areaId,
  parentGroupId: null,
  name: '華冠',
  position: 1,
  archivedAt: null,
  ...base,
  ...over,
});
const project = (areaId: string, over: object = {}) => ({
  id: newId(),
  areaId,
  groupId: null,
  name: 'LeetCode',
  mode: 'queue',
  position: 1.5,
  archivedAt: null,
  ...base,
  ...over,
});
const task = (over: object = {}) => ({
  id: newId(),
  projectId: null,
  title: 'Draft the weekly digest',
  notes: null,
  position: 0.25,
  dueDate: null,
  planStart: null,
  planGrain: null,
  later: false,
  prioritizedOn: null,
  ...base,
  ...over,
});
const session = (over: object = {}) => ({ id: newId(), startedAt: T2, endedAt: null, ...base, ...over });
const item = (sessionId: string, over: object = {}) => ({
  id: newId(),
  sessionId,
  projectId: null,
  taskId: null,
  position: 1,
  ...base,
  ...over,
});
const taskRecord = (taskId: string, over: object = {}) => ({
  id: newId(),
  taskId,
  kind: 'done',
  occurredOn: '2026-11-03',
  occurredAt: T2,
  sessionId: null,
  ...base,
  ...over,
});
const change = (entityId: string, over: object = {}) => ({
  id: newId(),
  entity: 'task',
  entityId,
  field: 'plan',
  oldValue: '2026-11-03/day',
  newValue: '2026-11-04/day',
  changedAt: T2,
  ...base,
  ...over,
});

const TABLES = ['areas', 'projectGroups', 'projects', 'tasks', 'taskRecords', 'sessions', 'sessionItems', 'changeLog'] as const;
const byId = (rows: { id: string }[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));

describe('store API: planner tables', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDatabase(t.db));

  const load = async () => (await t.http().get(BASE).expect(200)).body;
  const save = (changes: object) => t.http().patch(BASE).send(changes);

  /** An area with a queue, as most tests need. */
  function basics() {
    const study = area();
    const leetCode = project(study.id);
    return { study, leetCode };
  }

  it('gives back every kind of planner row exactly as it was saved', async () => {
    const { study, leetCode } = basics();
    const parent = group(study.id);
    const child = group(study.id, { parentGroupId: parent.id, name: 'Team', archivedAt: T2 });
    const list = project(study.id, { groupId: child.id, mode: 'list', name: 'General' });
    const digest = task({ projectId: list.id, planStart: '2026-11-02', planGrain: 'week', dueDate: '2026-11-06', notes: 'Line one\nline two' });
    const inbox = task({ later: true, prioritizedOn: '2026-11-03' });
    const problem = task({ projectId: leetCode.id, title: '#12', position: 1 / 3 });
    const block = session({ endedAt: '2026-11-03T14:40:00.000Z' });
    const changes = {
      areas: [study],
      // A child saved before its parent in the same request.
      projectGroups: [child, parent],
      projects: [leetCode, list],
      tasks: [digest, inbox, problem],
      sessions: [block],
      sessionItems: [item(block.id, { projectId: leetCode.id }), item(block.id, { taskId: digest.id, position: 2 })],
      taskRecords: [
        taskRecord(problem.id, { sessionId: block.id }),
        taskRecord(digest.id, { kind: 'worked_on', occurredOn: '2026-11-02', occurredAt: null }),
      ],
      changeLog: [change(digest.id), change(inbox.id, { newValue: 'later' }), change(newId(), { entity: 'task_record', field: 'deleted', newValue: null })],
    };
    await save(changes).expect(204);

    const after = await load();
    for (const table of TABLES) expect(byId(after[table])).toEqual(byId(changes[table]));
  });

  it('keeps one live outcome per task, and takes a replaced one in the same save', async () => {
    const digest = task();
    const done = taskRecord(digest.id);
    await save({ tasks: [digest], taskRecords: [done] }).expect(204);

    const res = await save({ taskRecords: [taskRecord(digest.id, { kind: 'let_go' })] }).expect(409);
    expect(res.body.detail).toContain('task_records_one_outcome');

    // Let go replaces done: the old one is soft-deleted in the same save.
    await save({ taskRecords: [taskRecord(digest.id, { kind: 'let_go' }), { ...done, deletedAt: T2, updatedAt: T2 }] }).expect(204);
    // Any number of worked-on records.
    await save({ taskRecords: [taskRecord(digest.id, { kind: 'worked_on' }), taskRecord(digest.id, { kind: 'worked_on' })] }).expect(204);
    expect((await load()).taskRecords).toHaveLength(4);
  });

  it.each([
    ['a plan without a grain', { planStart: '2026-11-03' }, 'tasks_plan_whole'],
    ['a planned task set aside for later', { planStart: '2026-11-03', planGrain: 'day', later: true }, 'tasks_later_unplanned'],
  ])('refuses %s (422)', async (_name, over, constraint) => {
    const res = await save({ tasks: [task(over)] }).expect(422);
    expect(res.body.detail).toContain(constraint);
  });

  it.each([
    ['neither', {}],
    ['both', 'both'],
  ])('refuses a session item drawing from %s (422)', async (_name, target) => {
    const { study, leetCode } = basics();
    const one = task();
    const block = session();
    const over = target === 'both' ? { projectId: leetCode.id, taskId: one.id } : {};
    const res = await save({ areas: [study], projects: [leetCode], tasks: [one], sessions: [block], sessionItems: [item(block.id, over)] }).expect(422);
    expect(res.body.detail).toContain('session_items_one_source');
    // All or nothing.
    expect((await load()).areas).toEqual([]);
  });

  it('refuses a session that ends before it starts (422)', async () => {
    const res = await save({ sessions: [session({ endedAt: '2026-11-03T12:00:00.000Z' })] }).expect(422);
    expect(res.body.detail).toContain('sessions_ends_after_start');
  });

  it('refuses rows that point at rows that are not stored (422)', async () => {
    await save({ projects: [project(newId())] }).expect(422);
    await save({ tasks: [task({ projectId: newId() })] }).expect(422);
    await save({ taskRecords: [taskRecord(newId())] }).expect(422);
    await save({ sessionItems: [item(newId(), { taskId: newId() })] }).expect(422);
  });

  it('checks the shape of every row (400)', async () => {
    const res = await save({
      projects: [project(newId(), { mode: 'board' })],
      tasks: [task({ planGrain: 'year', position: 'first', later: 'no' })],
      taskRecords: [taskRecord(newId(), { kind: 'skipped', occurredOn: '3 Nov' })],
      changeLog: [change(newId(), { entity: 'project' })],
    }).expect(400);
    expect(Object.keys(res.body.errors).sort()).toEqual([
      'changeLog.0.entity',
      'projects.0.mode',
      'taskRecords.0.kind',
      'taskRecords.0.occurredOn',
      'tasks.0.later',
      'tasks.0.planGrain',
      'tasks.0.position',
    ]);
  });

  it('empties the planner tables when restoring a backup without them', async () => {
    const { study, leetCode } = basics();
    const parent = group(study.id);
    const child = group(study.id, { parentGroupId: parent.id });
    const one = task({ projectId: leetCode.id });
    const block = session();
    await save({
      areas: [study],
      projectGroups: [parent, child],
      projects: [leetCode],
      tasks: [one],
      sessions: [block],
      sessionItems: [item(block.id, { taskId: one.id })],
      taskRecords: [taskRecord(one.id, { sessionId: block.id })],
      changeLog: [change(one.id)],
    }).expect(204);
    await t
      .http()
      .put(BASE)
      .send({
        accounts: [],
        categories: [],
        records: [],
        planVersions: [],
        budgetTransfers: [],
        moments: [],
        journals: [],
        comments: [],
        godNotes: [],
        ...Object.fromEntries(TABLES.map((table) => [table, []])),
        settings: null,
      })
      .expect(204);
    const after = await load();
    for (const table of TABLES) expect(after[table]).toEqual([]);
  });
});
