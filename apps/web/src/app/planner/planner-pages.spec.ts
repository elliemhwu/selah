import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { PlannerData } from '@selah/planner-core';
import { appRoutes } from '../app.routes';
import { TODAY } from '../core/today';
import type { DeviceSnapshot, MemoryStorage } from '../data/device-storage';
import { deviceData, flushSaves, storedArea, storedProject, storedTask, storedTaskRecord } from '../data/testing';
import { projectTree } from './data/planner-api';

// Today is Tue 3 Nov 2026; weeks start on Monday.
const TUE = '2026-11-03';

describe('Planner pages', () => {
  let storage: MemoryStorage;

  async function open(url: string, seed: Partial<DeviceSnapshot> = {}) {
    const device = deviceData({ settings: { id: 'settings', weekStartDay: 1, defaultCurrency: 'TWD', updatedAt: 'x' }, ...seed });
    storage = device.storage;
    TestBed.configureTestingModule({ providers: [provideRouter(appRoutes), ...device.providers, { provide: TODAY, useValue: () => TUE }] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await render(harness);
    return { harness, el: () => harness.routeNativeElement as HTMLElement, url: () => TestBed.inject(Router).url };
  }

  async function render(harness: RouterTestingHarness) {
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  async function click(harness: RouterTestingHarness, element: Element | null | undefined) {
    (element as HTMLElement).click();
    await flushSaves();
    await render(harness);
  }

  const study = { areas: [storedArea('a1')], projects: [storedProject('lc', 'a1', { name: 'LeetCode' }), storedProject('pa', 'a1', { name: 'Project A', mode: 'list' })] };
  const sectionTitles = (el: HTMLElement) => [...el.querySelectorAll('h2.section-title')].map((h) => h.textContent?.trim());

  it('shows Today, then what needs a decision', async () => {
    const { el } = await open('/planner', {
      ...study,
      tasks: [
        storedTask('quote', { projectId: 'pa', title: '整理報價單', planStart: TUE, planGrain: 'day', prioritizedOn: TUE }),
        storedTask('outline', { projectId: 'pa', title: 'Outline', planStart: '2026-11-02', planGrain: 'day' }),
        storedTask('late', { projectId: 'pa', title: 'Late', dueDate: '2026-11-01' }),
        storedTask('poster', { title: 'Poster' }),
      ],
    });
    expect(sectionTitles(el())).toEqual(['Today', 'Overdue', 'Slipped']);
    expect(el().querySelector('.inbox-link')?.textContent).toContain('1 unsorted in Inbox');
    const today = el().querySelector('selah-task-row');
    expect(today?.textContent).toContain('整理報價單');
    expect(today?.textContent).toContain('First');
    expect(el().querySelector('.slipped')?.textContent).toContain('Outline');
  });

  it('ticks a task done on Today, and un-ticks it', async () => {
    const { harness, el } = await open('/planner', { ...study, tasks: [storedTask('t1', { projectId: 'pa', planStart: TUE, planGrain: 'day' })] });
    await click(harness, el().querySelector('input.check'));
    expect(storage.snapshot().taskRecords).toEqual([expect.objectContaining({ taskId: 't1', kind: 'done', occurredOn: TUE })]);
    expect(el().querySelector('.task-row.finished')).not.toBeNull();
    await click(harness, el().querySelector('input.check'));
    expect(storage.snapshot().taskRecords[0].deletedAt).not.toBeNull();
  });

  it('brings a slipped task to today in one tap, and logs the change', async () => {
    const { harness, el } = await open('/planner', { ...study, tasks: [storedTask('t1', { projectId: 'pa', planStart: '2026-11-02', planGrain: 'day' })] });
    const today = [...el().querySelectorAll<HTMLButtonElement>('.slipped button')].find((b) => b.textContent?.trim() === 'Today');
    await click(harness, today);
    expect(storage.snapshot().tasks[0]).toMatchObject({ planStart: TUE, planGrain: 'day' });
    expect(storage.snapshot().changeLog).toEqual([expect.objectContaining({ oldValue: '2026-11-02/day', newValue: '2026-11-03/day' })]);
  });

  it('opens the pool and the queues when nothing is left for today', async () => {
    const { el } = await open('/planner', {
      ...study,
      tasks: [storedTask('wk', { projectId: 'pa', title: 'This week', planStart: '2026-11-02', planGrain: 'week' }), storedTask('#13', { projectId: 'lc', title: '3Sum' })],
    });
    expect(el().querySelector('#pool')?.textContent).toContain('This week');
    expect(el().querySelector('.queue')?.textContent).toContain('3Sum');
  });

  it('captures a new task into the Inbox with only a title', async () => {
    const { harness, el, url } = await open('/planner/tasks/new');
    const title = el().querySelector('#task-title') as HTMLInputElement;
    title.value = '寄場地清單給團隊';
    title.dispatchEvent(new Event('input'));
    await click(harness, el().querySelector('button.save'));
    expect(storage.snapshot().tasks).toEqual([expect.objectContaining({ title: '寄場地清單給團隊', projectId: null, planStart: null })]);
    expect(url()).toBe('/planner');
  });

  it('records work on a task, then asks when to continue (tomorrow by default)', async () => {
    const { harness, el, url } = await open('/planner/tasks/t1', { ...study, tasks: [storedTask('t1', { projectId: 'pa', planStart: TUE, planGrain: 'day' })] });
    const workedOn = [...el().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Worked on it');
    await click(harness, workedOn);
    expect(url()).toBe('/planner/tasks/t1/continue');
    expect(storage.snapshot().tasks[0]).toMatchObject({ planStart: '2026-11-04', planGrain: 'day' });
    await render(harness);
    expect(el().textContent).toContain('Continue when?');
  });

  it('plans a task for this week, normalized to the week', async () => {
    const { harness, el, url } = await open('/planner/tasks/t1/plan', { ...study, tasks: [storedTask('t1', { projectId: 'pa' })] });
    await click(harness, el().querySelector('#quick-thisWeek'));
    await click(harness, el().querySelector('button.save'));
    expect(storage.snapshot().tasks[0]).toMatchObject({ planStart: '2026-11-02', planGrain: 'week', later: false });
    expect(url()).toBe('/planner/tasks/t1');
  });

  it('marks a task done yesterday from the plan form', async () => {
    const { harness, el } = await open('/planner/tasks/t1/plan', { ...study, tasks: [storedTask('t1', { projectId: 'pa', planStart: '2026-11-02', planGrain: 'day' })] });
    const yesterday = [...el().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Done yesterday'));
    await click(harness, yesterday);
    expect(storage.snapshot().taskRecords).toEqual([expect.objectContaining({ kind: 'done', occurredOn: '2026-11-02', occurredAt: null })]);
  });

  it('gives no plan to a queue task', async () => {
    const { el } = await open('/planner/tasks/t1/plan', { ...study, tasks: [storedTask('t1', { projectId: 'lc' })] });
    expect(el().textContent).toContain("This task is in a queue");
    expect(el().querySelector<HTMLButtonElement>('button.save')?.disabled).toBe(true);
  });

  it('shows a queue with its next task and Study now', async () => {
    const { el } = await open('/planner/projects/lc', {
      ...study,
      tasks: [storedTask('#12', { projectId: 'lc', title: 'Two Sum', position: 1 }), storedTask('#13', { projectId: 'lc', title: '3Sum', position: 2 })],
      taskRecords: [storedTaskRecord('r1', '#12')],
    });
    expect(el().querySelector('.next-title')?.textContent).toBe('3Sum');
    expect(el().querySelector('.queue-card a')?.getAttribute('href')).toBe('/planner/study/new?project=lc');
  });

  it('copies a queue as a new project, every task open again', async () => {
    const { harness, el, url } = await open('/planner/projects/lc/copy', {
      ...study,
      tasks: [storedTask('#12', { projectId: 'lc', title: 'Two Sum', position: 1 }), storedTask('#13', { projectId: 'lc', title: '3Sum', position: 2 })],
      taskRecords: [storedTaskRecord('r1', '#12')],
    });
    expect(el().querySelector<HTMLInputElement>('#copy-name')?.value).toBe('LeetCode · again');
    await click(harness, el().querySelector('button.save'));
    const copy = storage.snapshot().projects.find((p) => p.name === 'LeetCode · again');
    expect(copy).toMatchObject({ mode: 'queue', areaId: 'a1' });
    expect(url()).toBe(`/planner/projects/${copy?.id}`);
    expect(storage.snapshot().tasks.filter((t) => t.projectId === copy?.id).map((t) => t.title)).toEqual(['Two Sum', '3Sum']);
    expect(storage.snapshot().taskRecords).toHaveLength(1);
  });

  it('works through a study session and ends it', async () => {
    const seed = { ...study, tasks: [storedTask('#12', { projectId: 'lc', title: 'Two Sum', position: 1 }), storedTask('#13', { projectId: 'lc', title: '3Sum', position: 2 })] };
    const { harness, el, url } = await open('/planner/study/new?project=lc', seed);
    await click(harness, el().querySelector('button.save'));
    expect(url()).toMatch(/^\/planner\/study\/[0-9a-f-]{36}$/);
    await render(harness);
    expect(el().querySelector('.source-title')?.textContent).toBe('Two Sum');
    await click(harness, [...el().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Done'));
    expect(el().querySelector('.source-title')?.textContent).toBe('3Sum');
    expect(el().querySelector('.done-list')?.textContent).toContain('Two Sum');
    await click(harness, [...el().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'End session'));
    expect(storage.snapshot().sessions[0].endedAt).not.toBeNull();
  });

  it('plans next week from Saturday, placing an Inbox task on a day', async () => {
    TestBed.overrideProvider(TODAY, { useValue: () => '2026-11-07' });
    const { harness, el } = await open('/planner/week', { ...study, tasks: [storedTask('poster', { title: 'Poster' })] });
    expect(el().querySelector('.range')?.textContent).toContain('9 Nov');
    const select = el().querySelector('.day-select') as HTMLSelectElement;
    select.value = '2026-11-10';
    select.dispatchEvent(new Event('change'));
    await flushSaves();
    await render(harness);
    expect(storage.snapshot().tasks[0]).toMatchObject({ planStart: '2026-11-10', planGrain: 'day' });
    expect(el().textContent).toContain('Nothing waiting to be placed.');
  });

  it('is an entry on the Selah home page', async () => {
    const { el } = await open('/');
    expect([...el().querySelectorAll('.module')].map((m) => m.getAttribute('href'))).toContain('/planner');
  });
});

describe('projectTree', () => {
  it('nests groups under their parent, in order, and hides archived rows', () => {
    const base = { createdAt: 'x', updatedAt: 'x', deletedAt: null, archivedAt: null };
    const data = {
      areas: [storedArea('a1')],
      projectGroups: [
        { id: 'g2', areaId: 'a1', parentGroupId: 'g1', name: 'Team', position: 1, ...base },
        { id: 'g1', areaId: 'a1', parentGroupId: null, name: '華冠', position: 1, ...base },
      ],
      projects: [storedProject('p1', 'a1', { groupId: 'g2' }), storedProject('p2', 'a1'), storedProject('old', 'a1', { archivedAt: 'x' })],
      tasks: [],
      taskRecords: [],
      sessions: [],
      sessionItems: [],
      changeLog: [],
    } as PlannerData;
    const [area] = projectTree(data).areas;
    expect(area.groups.map((g) => [g.group.id, g.depth, g.projects.map((p) => p.id)])).toEqual([
      ['g1', 0, []],
      ['g2', 1, ['p1']],
    ]);
    expect(area.projects.map((p) => p.id)).toEqual(['p2']);
  });
});
