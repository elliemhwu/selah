# 0018. The plan API saves whole versions

- Status: Accepted
- Date: 2026-10-06

## Context

The budget plan is versioned ([0012](0012-plan-versioning.md)). A version is a tree of items across sections, with cadences, amounts or percentages, rollover settings and monthly overrides. Many rules span several items: a parent must be in the same version and section, the tree must have no loops, and a carry target must exist in the version. The requirements say old versions are kept read-only.

## Decision

- **A version is saved whole.** `PUT /api/v1/finance/plan-versions/{id}` takes the start month, the note, and every item with its overrides. It replaces the stored version in one transaction. All rules are checked on the whole document, and every violation is reported per field (`items.3.parentItemId`).
- **Items are identified by `budgetItemId`** (the stable id, [0012](0012-plan-versioning.md)). A new `budgetItemId` creates the stable item. Its section can never change. Item order in the document is the display order.
- **Copying a version** is done by the client: it reads a version and saves it under a new id with a later start month. No special endpoint is needed.
- **Only the newest version can change.** Saving or deleting any other version returns `409`. A new version must start after the newest one. Older versions are a read-only log of how the plan changed.
- `GET /api/v1/finance/plan?month=YYYY-MM` returns the version active in that month: the latest one starting on or before it.
- The API stores and returns what was entered: amount *or* percent, as anchored. Derived numbers (the other half of the anchor, monthly totals, envelope balances) are computed by `libs/shared-utils`, in the web app's editor and in the report endpoints.

Rules that keep the percentage math well-defined:

- Income items are anchored to an amount. A percentage of income for an income item would be circular.
- Percentage-anchored Government items use `gross_income` as their base, because `net_income` is defined as income minus Government.
- Rollover applies to daily, weekly and monthly items only. The reset cycle must be at least as long as the cadence.
- Overrides apply to monthly items only, in months on or after the version's start.

## Consequences

- The editor can work freely in memory and save once. A half-finished edit never reaches the database.
- History is safe by construction: months covered by older versions always show the plan as it was.
- Fixing a mistake in an older version means creating a new version. Overrides for past months must be added before the next version is created.
