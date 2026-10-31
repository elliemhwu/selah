# 0033. The Planner module: tasks and records in the store, rules and views in planner-core

- Status: Accepted
- Date: 2026-10-31
- Builds on: [0030](0030-journal-module.md) (module layout), [0029](0029-generic-row-store-and-two-builds.md) (row store, two builds), [0011](0011-derive-dont-store.md) (derive, don't store), [0007](0007-offline-ready-data-conventions.md) (data conventions), [0004](0004-plan-record-pattern.md) (Plan → Record), [0022](0022-forms-are-routes.md) (forms are routes)
- Design: [docs/selah-planner-framework.md](../selah-planner-framework.md), build spec: [docs/planner/v1-spec.md](../planner/v1-spec.md)

## Context

Planner is Selah's third module and its core: Areas, optional Groups, Projects and Tasks, with plans by day, week or month, queues worked through in "Study now" sessions, and a Today view that separates Overdue from Slipped. The design came out of a requirements interview and is in the framework doc. The first draft of the build spec assumed per-feature endpoints, a server that knows "today", and a few cached columns. Selah's architecture rules out all three.

## Decision

**Planner follows Journal's layout ([0030](0030-journal-module.md))**

- A `planner` schema. Each table is rows in the store: a migration, a row DTO and a table mapper in `apps/api/src/planner/rows/`, registered in `StoreService`. No per-feature endpoints.
- Rules, the Today and week views, and the queue projection live in **`libs/planner-core`** as pure functions, tagged `module:planner`. Screens live in `apps/web/src/app/planner/`, read and write through `planner/data/planner-api.ts`, and never import `finance/` or `journal/`.
- The module has its own route, **`/planner`**, lazy-loaded, with an entry on the home page.
- Value sets (`plan_grain`, `project_mode`, `record_kind`) are CHECK constraints with their values in `libs/shared-types`, checked against the SQL by the existing test.

**Changes to the first spec**

- **Nothing derived is stored** ([0011](0011-derive-dont-store.md)). A task's status, whether it is started, its done day, Overdue, Slipped, Next, Pool and a queue's next item are computed in `planner-core` from the task and record rows the app already holds. The draft's `resolution`, `resolved_on` and `started` columns are dropped.
- **"Today" is the device's local date.** There is no server in the device build ([0029](0029-generic-row-store-and-two-builds.md)), so the app reads the date from the device clock. Calendar days are stored as `DATE` (plan start, due date, prioritized day, the day a record happened), so a task planned for Wed 11 Nov stays on that day wherever the phone is. The week start comes from `core.settings.week_start_day`. A time zone setting is not added in v1.
- **Undo is a soft delete** ([0007](0007-offline-ready-data-conventions.md)). Un-ticking a task sets `deleted_at` on its `done` record; letting go and restoring work the same way.
- **Sheets become form routes** ([0022](0022-forms-are-routes.md)): planning a task, "continue when?" after _worked on it_, the new-task form and the weekly sit-down are routes marked `data: { form: true }`.
- **The change log is a table of rows** (`planner.changes`), append-only, written by the `planner-core` rules in the same save as the change. It is backed up with everything else. Nothing reads it in v1.
- **Records point to their task** ([0004](0004-plan-record-pattern.md)). A task is a living plan and its records are the events along the way (`worked_on`, `done`, `let_go`). Unlike Finance, where an expense is recorded once, a task gathers several records over days.

**Tables (v1)**

`areas`, `project_groups` (nestable through `parent_group_id`), `projects` (`mode` list or queue), `tasks` (nullable `project_id` for the Inbox, `position`, `due_date`, `plan_start` + `plan_grain`, `later`, `prioritized_on`), `records` (`kind`, `occurred_on`, optional `occurred_at`, optional `session_id`), `sessions` and `session_items` (Study now; v2 time blocks extend them), and `changes`. Columns are in the spec.

## Chosen with the owner (2026-10-31)

- The table is `project_groups` and the UI says "Group" until a better word is found.
- A Study-now block is a `sessions` row. v2 time blocks (agenda, appointments) extend that table rather than adding another.
- No time zone setting in v1. It would matter only if a task should stay on Taipei's calendar while the phone is abroad.

## Consequences

- Planner works offline and in both builds with no extra work, and the .NET port gains eight more tables to store, not endpoints.
- Backups include the planner tables; older backups, without them, still restore.
- Every view is computed over all tasks and records in memory. That is cheap for one person's tasks; if it ever isn't, the views can be memoized in `planner-core` without changing the data.
- Routines and habits, agenda events and appointments come later. `records.task_id` can become nullable next to a `habit_id`, and sessions can gain a planned start and a firmness.
