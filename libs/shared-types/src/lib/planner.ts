// Planner value sets shared by web, api and planner-core. They mirror the
// CHECK constraints in db/migrations; change both together.

/** A list project keeps its tasks in any order; a queue's tasks are done in order. */
export const PROJECT_MODES = ['list', 'queue'] as const;
export type ProjectMode = (typeof PROJECT_MODES)[number];

/** How rough a plan is: a day, a week or a month. */
export const PLAN_GRAINS = ['day', 'week', 'month'] as const;
export type PlanGrain = (typeof PLAN_GRAINS)[number];

/** What happened to a task. */
export const TASK_RECORD_KINDS = ['worked_on', 'done', 'let_go'] as const;
export type TaskRecordKind = (typeof TASK_RECORD_KINDS)[number];

/** What a change-log row describes. */
export const CHANGE_ENTITIES = ['task', 'task_record'] as const;
export type ChangeEntity = (typeof CHANGE_ENTITIES)[number];
