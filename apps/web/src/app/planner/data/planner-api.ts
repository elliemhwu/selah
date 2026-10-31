import { computed, inject, Injectable } from '@angular/core';
import {
  archiveProject,
  deleteRecord,
  deleteTask,
  editRecordDay,
  endSession,
  inboxTasks,
  letGo,
  type PlanChoice,
  type PlannerChanges,
  type PlannerContext,
  type PlannerData,
  planTask,
  prioritizeTask,
  type ProjectGroupInput,
  type ProjectInput,
  projectTasks,
  recordDone,
  recordWorkedOn,
  reopenTask,
  saveArea,
  saveProject,
  saveProjectGroup,
  saveTask,
  sessionView,
  type SessionSource,
  startSession,
  type TaskInput,
  todayView,
  weekView,
} from '@selah/planner-core';
import type { LocalDate } from '@selah/shared-types';
import { NotFoundError } from '@selah/shared-utils';
import { AppSettings } from '../../core/app-settings';
import { TODAY } from '../../core/today';
import { deviceResource, IDLE } from '../../data/device-resource';
import type { DeviceChanges } from '../../data/device-storage';
import { DeviceStore } from '../../data/device-store';

/**
 * The Planner's data (ADR 0033): read from the device store, changed only
 * through the planner-core rules, in both builds (ADR 0029). Each change saves
 * the rows a rule returns, change-log rows included, in one save. Callers
 * generate ids for rows they create (ADR 0007).
 */
@Injectable({ providedIn: 'root' })
export class PlannerApi {
  readonly store = inject(DeviceStore);
  private readonly settings = inject(AppSettings);
  private readonly today = inject(TODAY);

  readonly data = computed<PlannerData>(() => {
    const { areas, projectGroups, projects, tasks, taskRecords, sessions, sessionItems, changeLog } = this.store.data();
    return { areas, projectGroups, projects, tasks, taskRecords, sessions, sessionItems, changeLog };
  });

  // ---- Views ----------------------------------------------------------------

  todayView() {
    return deviceResource(this.store, () => todayView(this.data(), this.today()));
  }

  weekView() {
    return deviceResource(this.store, () => weekView(this.data(), this.today(), this.settings.value().weekStartDay));
  }

  inbox() {
    return deviceResource(this.store, () => inboxTasks(this.data(), this.today()));
  }

  /** Live areas with their groups and projects, archived ones last; for the Projects screen and pickers. */
  tree() {
    return deviceResource(this.store, () => projectTree(this.data()));
  }

  /** One project with its tasks; idle while `id` is undefined. */
  project(id: () => string | undefined) {
    return deviceResource(this.store, () => {
      const value = id();
      if (!value) return IDLE;
      const data = this.data();
      const project = data.projects.find((p) => p.id === value && !p.deletedAt);
      if (!project) throw new NotFoundError(`Project ${value} not found.`);
      const area = data.areas.find((a) => a.id === project.areaId) ?? null;
      const group = data.projectGroups.find((g) => g.id === project.groupId) ?? null;
      return { project, area, group, tasks: projectTasks(value, data, this.today()) };
    });
  }

  /** One task with its records, newest first; idle while `id` is undefined. */
  task(id: () => string | undefined) {
    return deviceResource(this.store, () => {
      const value = id();
      if (!value) return IDLE;
      const data = this.data();
      const task = data.tasks.find((t) => t.id === value && !t.deletedAt);
      if (!task) throw new NotFoundError(`Task ${value} not found.`);
      const project = data.projects.find((p) => p.id === task.projectId) ?? null;
      const records = data.taskRecords
        .filter((r) => r.taskId === value && !r.deletedAt)
        .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt));
      const ended = records.find((r) => r.kind !== 'worked_on') ?? null;
      return { task, project, records, ended, inQueue: project?.mode === 'queue' };
    });
  }

  /** A Study-now session; idle while `id` is undefined. */
  session(id: () => string | undefined) {
    return deviceResource(this.store, () => {
      const value = id();
      if (!value) return IDLE;
      const view = sessionView(value, this.data(), this.today());
      if (!view) throw new NotFoundError(`Session ${value} not found.`);
      return view;
    });
  }

  // ---- Changes --------------------------------------------------------------

  saveArea(id: string, name: string) {
    return this.apply((data, ctx) => saveArea(id, { name }, data, ctx));
  }

  saveGroup(id: string, input: ProjectGroupInput) {
    return this.apply((data, ctx) => saveProjectGroup(id, input, data, ctx));
  }

  saveProject(id: string, input: ProjectInput) {
    return this.apply((data, ctx) => saveProject(id, input, data, ctx));
  }

  archiveProject(id: string, archived: boolean) {
    return this.apply((data, ctx) => archiveProject(id, archived, data, ctx));
  }

  saveTask(id: string, input: TaskInput) {
    return this.apply((data, ctx) => saveTask(id, input, data, ctx));
  }

  plan(taskId: string, plan: PlanChoice) {
    return this.apply((data, ctx) => planTask(taskId, plan, data, ctx));
  }

  prioritize(taskId: string, prioritized: boolean) {
    return this.apply((data, ctx) => prioritizeTask(taskId, prioritized, data, ctx));
  }

  deleteTask(taskId: string) {
    return this.apply((data, ctx) => deleteTask(taskId, data, ctx));
  }

  /** Done now, or on an earlier day. */
  done(taskId: string, options: { on?: LocalDate; sessionId?: string } = {}) {
    return this.apply((data, ctx) => recordDone(ctx.newId(), taskId, data, ctx, options));
  }

  letGo(taskId: string) {
    return this.apply((data, ctx) => letGo(ctx.newId(), taskId, data, ctx));
  }

  reopen(taskId: string) {
    return this.apply((data, ctx) => reopenTask(taskId, data, ctx));
  }

  /** Records work and plans the next time; tomorrow unless `next` says otherwise. Returns the new record's id. */
  async workedOn(taskId: string, options: { next?: PlanChoice; sessionId?: string } = {}): Promise<string> {
    const recordId = crypto.randomUUID();
    await this.apply((data, ctx) => recordWorkedOn(recordId, taskId, data, ctx, options));
    return recordId;
  }

  editRecordDay(recordId: string, day: LocalDate) {
    return this.apply((data, ctx) => editRecordDay(recordId, day, data, ctx));
  }

  deleteRecord(recordId: string) {
    return this.apply((data, ctx) => deleteRecord(recordId, data, ctx));
  }

  startSession(sessionId: string, sources: readonly SessionSource[]) {
    return this.apply((data, ctx) => startSession(sessionId, sources, data, ctx));
  }

  endSession(sessionId: string) {
    return this.apply((data, ctx) => endSession(sessionId, data, ctx));
  }

  /** The context every rule gets: the clock and the week, read once. */
  context(): PlannerContext {
    return { now: new Date().toISOString(), today: this.today(), weekStartDay: this.settings.value().weekStartDay, newId: () => crypto.randomUUID() };
  }

  private async apply(rule: (data: PlannerData, ctx: PlannerContext) => PlannerChanges): Promise<void> {
    const changes = rule(this.data(), this.context());
    if (Object.keys(changes).length) await this.store.save(toDeviceChanges(changes));
  }
}

export interface ProjectTree {
  areas: {
    area: PlannerData['areas'][number];
    groups: { group: PlannerData['projectGroups'][number]; depth: number; projects: PlannerData['projects'][number][] }[];
    /** Projects in no group. */
    projects: PlannerData['projects'][number][];
  }[];
}

/** Areas in order; each with its groups (nested ones after their parent, with a depth) and projects. */
export function projectTree(data: PlannerData): ProjectTree {
  const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;
  const live = <T extends { deletedAt: string | null; archivedAt: string | null }>(row: T) => !row.deletedAt && !row.archivedAt;
  const projects = data.projects.filter(live).sort(byPosition);
  const groups = data.projectGroups.filter(live).sort(byPosition);
  return {
    areas: data.areas
      .filter(live)
      .sort(byPosition)
      .map((area) => {
        const ordered: ProjectTree['areas'][number]['groups'] = [];
        const visit = (parentId: string | null, depth: number) => {
          for (const group of groups.filter((g) => g.areaId === area.id && g.parentGroupId === parentId)) {
            ordered.push({ group, depth, projects: projects.filter((p) => p.groupId === group.id) });
            visit(group.id, depth + 1);
          }
        };
        visit(null, 0);
        return { area, groups: ordered, projects: projects.filter((p) => p.areaId === area.id && !p.groupId) };
      }),
  };
}

function toDeviceChanges(changes: PlannerChanges): DeviceChanges {
  return changes;
}
