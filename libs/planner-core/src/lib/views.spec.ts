import { planTask, recordDone, recordWorkedOn, saveTask, startSession } from './rules';
import { applied, area, context, data, project, record, task } from './testing';
import { inboxTasks, projectTasks, queueNext, sessionView, todayView, weekView } from './views';

// The acceptance scenarios of the v1 spec (§8). Today is Tue 3 Nov 2026.

const TUE = '2026-11-03';
const ids = (views: { task: { id: string } }[]) => views.map((v) => v.task.id);

function leetCode(count: number) {
  return data({
    projects: [project('lc', { mode: 'queue', name: 'LeetCode' })],
    tasks: Array.from({ length: count }, (_, i) => task(`#${12 + i}`, { projectId: 'lc', position: i + 1 })),
  });
}

describe('todayView', () => {
  it('1 · a missed day shifts nothing in a queue', () => {
    let rows = leetCode(4);
    const mon = context('2026-11-02');
    rows = applied(rows, startSession('s1', [{ projectId: 'lc' }], rows, mon));
    rows = applied(rows, recordDone('r1', '#12', rows, mon, { sessionId: 's1' }));
    // No session on Tuesday. On Wednesday the queue simply gives the next one.
    expect(queueNext('lc', rows, '2026-11-04')?.task.id).toBe('#13');
    expect(rows.tasks.every((t) => t.planStart === null)).toBe(true);
    expect(todayView(rows, '2026-11-04').queues[0]).toMatchObject({ next: { task: { id: '#13' } }, done: 1, total: 4 });
  });

  it('2 · a cross-day task slips, comes back, and keeps its history', () => {
    let rows = data({ tasks: [task('digest', { planStart: TUE, planGrain: 'day' })] });
    rows = applied(rows, recordWorkedOn('w1', 'digest', rows, context(TUE)));
    const thu = '2026-11-05';
    const slipped = todayView(rows, thu).slipped;
    expect(slipped).toEqual([expect.objectContaining({ started: true, status: 'started' })]);
    const thuCtx = { ...context(thu), newId: () => 'y1' };
    rows = applied(rows, planTask('digest', { grain: 'day', start: thu }, rows, thuCtx));
    expect(ids(todayView(rows, thu).today)).toEqual(['digest']);
    rows = applied(rows, recordDone('d1', 'digest', rows, thuCtx));
    expect(rows.taskRecords.map((r) => [r.kind, r.occurredOn])).toEqual([
      ['worked_on', TUE],
      ['done', thu],
    ]);
    expect(rows.changeLog.map((c) => [c.oldValue, c.newValue])).toEqual([
      ['2026-11-03/day', '2026-11-04/day'],
      ['2026-11-04/day', '2026-11-05/day'],
    ]);
  });

  it('3 · done yesterday from Slipped', () => {
    let rows = data({ tasks: [task('outline', { planStart: '2026-11-02', planGrain: 'day' })] });
    expect(ids(todayView(rows, TUE).slipped)).toEqual(['outline']);
    rows = applied(rows, recordDone('d1', 'outline', rows, context(TUE), { on: '2026-11-02' }));
    expect(todayView(rows, TUE).slipped).toEqual([]);
    expect(rows.taskRecords[0]).toMatchObject({ occurredOn: '2026-11-02', occurredAt: null });
  });

  it('keeps a task done today on Today, crossed out', () => {
    const rows = data({ tasks: [task('t1', { planStart: TUE, planGrain: 'day' })], taskRecords: [record('d1', 't1', { occurredOn: TUE })] });
    const view = todayView(rows, TUE);
    expect(view.today).toEqual([expect.objectContaining({ status: 'done', open: false })]);
    expect(view.openToday).toBe(0);
  });

  it('5 · a week plan slips when its week ends', () => {
    const rows = data({ tasks: [task('t1', { planStart: '2026-11-02', planGrain: 'week' })] });
    expect(ids(todayView(rows, '2026-11-08').pool)).toEqual(['t1']);
    expect(ids(todayView(rows, '2026-11-09').slipped)).toEqual(['t1']);
  });

  it('6 · overdue wins over slipped', () => {
    const rows = data({ tasks: [task('t1', { planStart: '2026-11-02', planGrain: 'day', dueDate: '2026-11-04' })] });
    const view = todayView(rows, '2026-11-05');
    expect(ids(view.overdue)).toEqual(['t1']);
    expect(view.slipped).toEqual([]);
  });

  it('8 · the pool holds this week, then this month', () => {
    const rows = data({
      tasks: [
        task('month', { planStart: '2026-11-01', planGrain: 'month', position: 1 }),
        task('week2', { planStart: '2026-11-02', planGrain: 'week', position: 3 }),
        task('week1', { planStart: '2026-11-02', planGrain: 'week', position: 2 }),
      ],
    });
    expect(ids(todayView(rows, TUE).pool)).toEqual(['week1', 'week2', 'month']);
  });

  it('9 · Prioritized lasts for one day and comes first', () => {
    const rows = data({
      tasks: [task('a', { planStart: TUE, planGrain: 'day', position: 1 }), task('b', { planStart: TUE, planGrain: 'day', position: 2, prioritizedOn: TUE })],
    });
    expect(todayView(rows, TUE).today.map((v) => [v.task.id, v.prioritized])).toEqual([
      ['b', true],
      ['a', false],
    ]);
    const wed = data({ tasks: [task('b', { planStart: '2026-11-04', planGrain: 'day', prioritizedOn: TUE })] });
    expect(todayView(wed, '2026-11-04').today[0].prioritized).toBe(false);
  });

  it('shows unplanned due dates within a week in Due soon, but not later ones or queue tasks', () => {
    const rows = data({
      projects: [project('p1'), project('q1', { mode: 'queue' })],
      tasks: [
        task('soon', { dueDate: '2026-11-08' }),
        task('far', { dueDate: '2026-11-10' }),
        task('aside', { dueDate: '2026-11-05', later: true }),
        task('queued', { projectId: 'q1', dueDate: '2026-11-05' }),
      ],
    });
    expect(ids(todayView(rows, TUE).dueSoon)).toEqual(['soon']);
  });

  it('counts the Inbox and hides archived projects', () => {
    const rows = data({
      areas: [area('a1'), area('old', { archivedAt: TUE })],
      projects: [project('p1'), project('gone', { archivedAt: TUE }), project('oldp', { areaId: 'old' })],
      tasks: [
        task('i1', { projectId: null }),
        task('i2', { projectId: null }),
        task('x', { projectId: 'gone', planStart: TUE, planGrain: 'day' }),
        task('y', { projectId: 'oldp', planStart: TUE, planGrain: 'day' }),
      ],
    });
    const view = todayView(rows, TUE);
    expect(view.inboxCount).toBe(2);
    expect(view.today).toEqual([]);
  });
});

describe('weekView', () => {
  it('7 · plans next week from Saturday, Inbox first in the order captured', () => {
    let rows = data({ projects: [project('p1'), project('general', { name: '華冠 · General' })] });
    const tue = context(TUE);
    for (const [id, projectId] of [
      ['poster', null],
      ['pastor', null],
      ['venue', null],
      ['timesheet', 'general'],
    ] as const) {
      rows = applied(rows, saveTask(id, { title: id, projectId }, rows, { ...tue, now: `${TUE}T03:4${rows.tasks.length}:00.000Z` }));
    }
    expect(todayView(rows, TUE).inboxCount).toBe(3);
    const week = weekView(rows, '2026-11-07', 1);
    expect(week.start).toBe('2026-11-09');
    expect(ids(week.inbox)).toEqual(['poster', 'pastor', 'venue']);
    expect(ids(inboxTasks(rows, TUE))).toEqual(['poster', 'pastor', 'venue']);
  });

  it('plans this week until its sixth day', () => {
    expect(weekView(data(), '2026-11-06', 1).start).toBe('2026-11-02');
    expect(weekView(data(), '2026-11-07', 1).start).toBe('2026-11-09');
    expect(weekView(data(), '2026-11-05', 7).start).toBe('2026-11-01');
    expect(weekView(data(), '2026-11-06', 7).start).toBe('2026-11-08');
  });

  it('gathers carried-over, due-soon and this-month tasks, and each day and the week', () => {
    const rows = data({
      tasks: [
        task('lastweek', { planStart: '2026-11-02', planGrain: 'week' }),
        task('friday', { planStart: '2026-11-06', planGrain: 'day' }),
        task('mon', { planStart: '2026-11-09', planGrain: 'day' }),
        task('wk', { planStart: '2026-11-09', planGrain: 'week' }),
        task('nov', { planStart: '2026-11-01', planGrain: 'month' }),
        task('due', { dueDate: '2026-11-16' }),
        task('notdue', { dueDate: '2026-11-23' }),
      ],
    });
    const week = weekView(rows, '2026-11-07', 1);
    expect(ids(week.carriedOver)).toEqual(['lastweek', 'friday']);
    expect(ids(week.days[0].tasks)).toEqual(['mon']);
    expect(ids(week.week)).toEqual(['wk']);
    expect(ids(week.thisMonth)).toEqual(['nov']);
    expect(ids(week.dueSoon)).toEqual(['due']);
  });
});

describe('projects and sessions', () => {
  it('lists a project with open tasks first', () => {
    const rows = data({ tasks: [task('a', { position: 1 }), task('b', { position: 2 })], taskRecords: [record('d', 'a')] });
    expect(ids(projectTasks('p1', rows, TUE))).toEqual(['b', 'a']);
  });

  it('shows what a session gives next and what it has done', () => {
    let rows = leetCode(3);
    const ctx = context(TUE);
    rows = applied(rows, startSession('s1', [{ projectId: 'lc' }], rows, ctx));
    rows = applied(rows, recordDone('d1', '#12', rows, { ...ctx, now: `${TUE}T12:10:00.000Z` }, { sessionId: 's1' }));
    rows = applied(rows, recordDone('d2', '#13', rows, { ...ctx, now: `${TUE}T12:30:00.000Z` }, { sessionId: 's1' }));
    const view = sessionView('s1', rows, TUE);
    expect(view?.items[0]).toMatchObject({ current: { task: { id: '#14' } }, done: 2, total: 3 });
    expect(ids(view?.done ?? [])).toEqual(['#12', '#13']);
    expect(sessionView('nope', rows, TUE)).toBeNull();
  });
});
