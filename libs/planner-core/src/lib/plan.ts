import { type IsoWeekday, type LocalDate, PLAN_GRAINS, type PlanGrain } from '@selah/shared-types';
import { addDays, endOfMonth, startOfMonth, startOfWeek } from '@selah/shared-utils';

// A plan is a day, a week or a month (the framework doc, "Plan to do can be
// rough"). It is stored as its first day and its grain, so one rule finds
// what slipped at every size.

export interface Plan {
  grain: PlanGrain;
  start: LocalDate;
}

/** The plan with its start moved to the first day of its week or month. */
export function normalizePlan(plan: Plan, weekStartDay: IsoWeekday): Plan {
  switch (plan.grain) {
    case 'day':
      return plan;
    case 'week':
      return { grain: 'week', start: startOfWeek(plan.start, weekStartDay) };
    case 'month':
      return { grain: 'month', start: startOfMonth(plan.start) };
  }
}

/** The first day after the plan: it has slipped once today reaches this day. */
export function planEnd(plan: Plan): LocalDate {
  switch (plan.grain) {
    case 'day':
      return addDays(plan.start, 1);
    case 'week':
      return addDays(plan.start, 7);
    case 'month':
      return addDays(endOfMonth(plan.start), 1);
  }
}

/** Whether `date` falls inside the plan. */
export function planContains(plan: Plan, date: LocalDate): boolean {
  return plan.start <= date && date < planEnd(plan);
}

export function isPlanGrain(value: string): value is PlanGrain {
  return (PLAN_GRAINS as readonly string[]).includes(value);
}

/** A task's plan, or null when it has none. */
export function planOf(task: { planStart: LocalDate | null; planGrain: PlanGrain | null }): Plan | null {
  return task.planStart && task.planGrain ? { grain: task.planGrain, start: task.planStart } : null;
}

/** How a plan is written in the change log: '2026-11-04/day', 'later', or null. */
export function planText(plan: Plan | null, later: boolean): string | null {
  if (plan) return `${plan.start}/${plan.grain}`;
  return later ? 'later' : null;
}
