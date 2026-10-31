# planner-core

The Planner rules and views as pure functions ([ADR 0033](../../docs/decisions/0033-planner-module.md)), run by the app before every save in both builds. The design is in [selah-planner-framework.md](../../docs/selah-planner-framework.md) and the [v1 spec](../../docs/planner/v1-spec.md).

- **Rules:** `saveArea`, `saveProjectGroup`, `saveProject`, `archiveProject`, `saveTask`, `planTask`, `prioritizeTask`, `deleteTask`, `recordDone`, `letGo`, `reopenTask`, `recordWorkedOn`, `editRecordDay`, `deleteRecord`, `startSession`, `endSession`. Each takes the input, the rows the app holds and a `PlannerContext` (now, today, the week's first day, new ids), returns the rows to save, change-log rows included, or throws `RuleViolationError` (with field errors), `ConflictError` or `NotFoundError` from `libs/shared-utils`.
- **Views:** `todayView` (Today, Overdue, Slipped, Due soon, the pool and the queues), `weekView` (the weekly sit-down), `projectTasks`, `inboxTasks`, `queueNext`, `sessionView`.
- **Plans:** `normalizePlan`, `planEnd` (exclusive), `planContains`; positions with `positionAtEnd` and `positionBetween`.

Status, slipped, overdue and a queue's next task are calculated from the rows, never stored. "Today" is the device's local date, passed in by the caller. No framework imports, and no imports from Finance or Journal; the lint rules enforce both.

Run the tests with `pnpm nx test planner-core`.
