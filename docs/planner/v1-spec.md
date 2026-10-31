# Selah Planner · v1 Spec

_2026-10-31 · Derived from [selah-planner-framework.md](../selah-planner-framework.md); structure in [ADR 0033](../decisions/0033-planner-module.md). Mockup: Selah Planner Mockup (artifact)._

Goal of v1: **replace Notion for my own task management.** Anything not listed here is out of scope.

## 1. Scope

**In v1**

- Areas → optional Groups → Projects → Tasks
- Tasks with Due, Plan-to-do (day / week / month), Done from records
- Inbox for quick capture
- Queues (ordered projects) and **Study now** sessions
- Today view: Today · Overdue · Slipped · Due soon · This week & month · queue suggestions
- Slipped actions, _worked on it_, Prioritized (today), Let go, Later
- Weekly sit-down
- Silent change log

**Not in v1** (see §10): agenda and events, planned time blocks, appointments, availability, routines and habits, pace prediction, insights, the Reading/Study module, recurrence, sharing.

**Surface vs depth.** Every feature has a default path that needs no setup. Groups, queue settings, _done on…_ and editing records live in depth (swipe, long-press, detail form).

## 2. Concepts

| Concept         | Meaning                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Area**        | Life domain (工作, 學習, 信仰).                                                             |
| **Group**       | Optional layer between Area and Project (a job, church). Can nest. Shown only if used.      |
| **Project**     | Container of tasks. Flat. Mode `list` (default) or `queue`.                                 |
| **Inbox**       | Tasks with no project.                                                                      |
| **Task**        | Unit of work. A living plan.                                                                |
| **Plan period** | When I intend to do it: a **day**, a **week** or a **month**.                               |
| **Record**      | An event on a task: `worked_on`, `done`, `let_go`. Editable; edits are logged.              |
| **Queue**       | A project in `queue` mode. Its tasks are done in `position` order and never get plan dates. |
| **Session**     | A Study-now block: a start time and the queues or tasks it draws from.                      |
| **Prioritized** | "Do this first today." Clears overnight.                                                    |
| **Later**       | Unplanned on purpose: hidden from Due soon and the pool. Replaces Notion's _Future_.        |

## 3. Time rules

- **Moments** are `TIMESTAMPTZ`, shown in local time: record times, session start and end, the change log.
- **Calendar days** are `DATE` (`LocalDate` strings in the app): plan start, due date, prioritized day, the day a record happened.
- **Today** is the device's local date. All "today / this week / slipped" logic compares local dates.
- **The week starts** on `core.settings.week_start_day` (Monday by default).
- Plan periods are **normalized** when saved: `day` → that date, `week` → the first day of that week, `month` → the 1st.
- **Period end (exclusive):** day → start + 1 day; week → start + 7 days; month → start + 1 month.

## 4. Tables (`planner` schema)

Every table follows [ADR 0007](../decisions/0007-offline-ready-data-conventions.md): `id UUID PRIMARY KEY DEFAULT uuidv7()` (the app generates it), `created_at`, `updated_at` with the `core.set_updated_at` trigger, and `deleted_at`. No owner columns. Nothing derived is stored ([ADR 0011](../decisions/0011-derive-dont-store.md)).

| Table            | Columns                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `areas`          | `name`, `position DOUBLE PRECISION`, `archived_at`                                                                                                                                   |
| `project_groups` | `area_id`, `parent_group_id` (nullable), `name`, `position`, `archived_at`                                                                                                           |
| `projects`       | `area_id`, `group_id` (nullable), `name`, `mode` (`list` \| `queue`), `position`, `archived_at`                                                                                      |
| `tasks`          | `project_id` (nullable = Inbox), `title`, `notes`, `position`, `due_date DATE`, `plan_start DATE`, `plan_grain` (`day` \| `week` \| `month`), `later BOOLEAN`, `prioritized_on DATE` |
| `task_records`   | `task_id`, `kind` (`worked_on` \| `done` \| `let_go`), `occurred_on DATE`, `occurred_at TIMESTAMPTZ` (nullable: "done yesterday" has no time), `session_id` (nullable)               |
| `sessions`       | `started_at`, `ended_at` (nullable)                                                                                                                                                  |
| `session_items`  | `session_id`, `project_id` (a queue: "its next item") or `task_id` (exactly one), `position`                                                                                         |
| `change_log`     | `entity` (`task` \| `task_record`), `entity_id`, `field`, `old_value TEXT`, `new_value TEXT` ('2026-11-04/day', 'later', a date), `changed_at`                                       |

**Constraints**

- `tasks`: `plan_start` and `plan_grain` are both set or both null; `later` and a plan are never both set.
- `session_items`: `num_nonnulls(project_id, task_id) = 1`.
- Value sets are CHECK constraints, with their values in `libs/shared-types/src/lib/planner.ts`.

**Rules kept by `planner-core`** (before every save, in both builds)

- A queue task never has a plan; moving a task into a queue clears its plan.
- Setting a plan clears `later`, and setting `later` clears the plan.
- A task has at most one live `done` or `let_go` record; recording one soft-deletes the other.
- Every change to a task's plan, `later`, due date, or to a record's day or deletion adds a `change_log` row in the same save.
- `position` is a number: inserting between two rows takes their midpoint, so reordering saves one row.

## 5. Calculated views (`planner-core`)

Let `T` be today. A task is **open** when it has no live `done` or `let_go` record.

| View            | Rule                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| **Status**      | `done` / `let_go` from its live record; else `started` if it has a live `worked_on`; else `not_started` |
| **Overdue**     | open and `due_date < T`                                                                                 |
| **Slipped**     | open, not overdue, planned, and the plan period's end ≤ `T`                                             |
| **Today**       | open, `plan_grain = day` and `plan_start = T`                                                           |
| **Prioritized** | `prioritized_on = T`                                                                                    |
| **Due soon**    | open, no plan, not `later`, not in a queue, `T ≤ due_date < T + 7 days`                                 |
| **Pool**        | open, not overdue or slipped, planned for the week or month that contains `T`. Week tasks first.        |
| **Queue next**  | in a `queue` project: the open task with the lowest `position`                                          |
| **Inbox**       | open and no project                                                                                     |

Overdue wins over Slipped: a task shows in one section only.

## 6. Screens and routes

All under `/planner`, in the Linen ledger look ([ADR 0021](../decisions/0021-linen-ledger-ui.md)). Forms are routes ([ADR 0022](../decisions/0022-forms-are-routes.md)).

| Route                                        | Screen                                                                                                                                                                                                                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/planner`                                   | **Today**: Inbox count, Today (Prioritized first), Overdue, Slipped (inline _Today · Plan… · Let go_), Due soon, This week & month (collapsed unless Today is empty), queue suggestions when Today is done. _Study now_ and _New task_ above the bottom navigation (Today · Projects · Inbox). |
| `/planner/inbox`                             | Inbox list                                                                                                                                                                                                                                                                                     |
| `/planner/projects`, `/planner/projects/:id` | Areas → Groups → Projects; a project's tasks in order, done ones collapsed. A queue shows its next item, _Study now_ and _Copy as a new project_.                                                                                                                                              |
| `/planner/tasks/new`                         | **New task** form. From inside a project it goes there; otherwise to the Inbox. Title is the only required field.                                                                                                                                                                              |
| `/planner/tasks/:id`                         | Task detail: title, notes, project, due date, records (editable)                                                                                                                                                                                                                               |
| `/planner/tasks/:id/plan`                    | **Plan** form: Today · Tomorrow · This week · Next week · This month · No date; Day / Week / Month calendar; _Already done?_ (yesterday / another day); Later; Let go                                                                                                                          |
| `/planner/tasks/:id/continue`                | **Continue when?** after _worked on it_: Tomorrow (default; Close keeps it) · Pick… · Later. Not shown for queue tasks.                                                                                                                                                                        |
| `/planner/study/new`, `/planner/study/:id`   | **Study now**: pick queues or tasks; each shows its next item with _Done_ and _Worked on it_. _End session_ sets `ended_at`.                                                                                                                                                                   |
| `/planner/week`                              | **Weekly sit-down**: day strip with a Week bucket; Inbox, Carried over, Due soon, This month; each row → a day, this week, later or let go. On a Saturday or Sunday it plans next week.                                                                                                        |

A session left open closes at the time of its last record when the next one starts.

## 7. Data flow

- The planner tables are rows in the store ([ADR 0029](../decisions/0029-generic-row-store-and-two-builds.md)): a row DTO and table mapper each in `apps/api/src/planner/rows/`, registered in `StoreService` in save order (areas → project_groups → projects → tasks → sessions → session_items → task_records → change_log). Store keys are camelCase and global across modules, so Finance's `records` stays theirs: `taskRecords`, `changeLog`.
- Screens call `apps/web/src/app/planner/data/planner-api.ts`, which reads the `DeviceStore`, runs the `planner-core` rule for the change, and saves the rows it returns (the task, its records and its `change_log` rows) in one save.
- `planner-core` exports the row types, the rules (`prepareTask`, `planTask`, `recordDone`, `recordWorkedOn`, `letGo`, …) and the views (`todayView`, `weekView`, `queueNext`), all taking `today: LocalDate` as an argument so tests never depend on the clock.

## 8. Acceptance scenarios

| #   | Scenario                                                                                            | Expected                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | **Missed LeetCode.** Queue #12–#40. Study now Mon, done #12. No session Tue. Study now Wed.         | Wed shows #13. Nothing was rescheduled; no queue task has a plan.                                                    |
| 2   | **Cross-day digest.** Planned Tue (day). Tue: _worked on it_ → tomorrow. Wed: nothing. Thu morning. | Thu: in **Slipped**, started. _Today_ → Today. Done Thu → records `worked_on` Tue, `done` Thu. Changes: Tue→Wed→Thu. |
| 3   | **Done yesterday.** Planned Mon, finished Mon night, opened Tue.                                    | In Slipped. _Done yesterday_ → `occurred_on` Mon, `occurred_at` null.                                                |
| 4   | **Wrong tick.** Tick the wrong task.                                                                | Tap again → the `done` record is soft-deleted; the change is logged; the UI shows nothing else.                      |
| 5   | **Week slip.** Planned "week of Nov 2", open on Mon Nov 9.                                          | In **Slipped** on Nov 9, and in **Carried over** at the sit-down.                                                    |
| 6   | **Overdue beats slipped.** Planned Mon, due Wed, open on Thu.                                       | Only in **Overdue**.                                                                                                 |
| 7   | **Rush capture.** At the Ahava meeting, _New task_ from Today ×3; from inside 華冠 · General ×1.    | 3 in the Inbox (count 3), 1 in 華冠 · General. The 3 Inbox tasks come first at the sit-down.                         |
| 8   | **Empty day.** No Today tasks; 2 planned this week, 1 this month.                                   | The pool is open: the 2 week tasks, then the month one.                                                              |
| 9   | **Prioritized resets.** Prioritize 2 tasks Tue; open Wed.                                           | Neither is prioritized on Wed.                                                                                       |
| 10  | **Abroad.** Task planned Wed 11 Nov; the phone's clock is in another time zone.                     | It is still a Wed 11 Nov task; it shows on Today when the device's local date is 11 Nov.                             |

## 9. Defaults for small open items

| Item                   | v1 default                                       |
| ---------------------- | ------------------------------------------------ |
| Group display name     | "Group" (placeholder)                            |
| Does a group end?      | Only `archived_at`; no start/end history         |
| Catch-all projects     | Normal projects (e.g. "華冠 · General")          |
| LeetCode weekly quiz   | A normal dated task, not in the queue            |
| Due soon window        | 7 days                                           |
| Seminary weekly videos | Created upfront from the syllabus as dated tasks |

## 10. Out of scope (designed for, not built)

- **Agenda → weekly events, planned time blocks, appointments** (v2): sessions gain a planned start and end, a firmness and an agenda link; firm blocks record themselves.
- **Routines and habits**: `task_records.task_id` becomes nullable next to a `habit_id`, with a one-of check.
- **Insights** from `change_log` and task records.
- **Pace-based "at risk"** for queues with a due date.
- **Availability and context filters.**
- **Reading / Study module** (passes, per-chapter notes).
- **Recurrence inside projects.**
- **Sharing** (a hosted service with accounts, [ADR 0028](../decisions/0028-local-only.md)).
