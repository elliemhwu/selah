# 0019. Budget transfers and report endpoints

- Status: Accepted
- Date: 2026-10-07

## Context

Phase 4d adds manual budget transfers and the three report views from the requirements (§4): envelope balances on the home screen, the recurring checklist, and the monthly plan vs. actual review. Everything in them is calculated on read ([0011](0011-derive-dont-store.md)), across plan versions ([0012](0012-plan-versioning.md), [0018](0018-plan-api.md)). Several rules were not yet pinned down: what a percentage is a percentage of, how parent items relate to their children, what happens to an envelope when the plan changes, and in which order carried resets are applied.

## Decision

### Budget transfers

- `PUT /api/v1/finance/budget-transfers/{id}` upserts a **manual** transfer ([0017](0017-api-conventions.md)): date, optional time, from item, to item, whole positive TWD, note. `GET` lists them by date range (optionally for one item, either side), `GET /{id}`, `DELETE /{id}` soft-deletes.
- Both items must exist and differ. **Income items are not budgets:** they can't be in a transfer, roll over, or receive a carried reset. The plan API now enforces the last two.
- Stored rows of kind `reset` belong to Close Week (beta). The API never writes them and refuses to overwrite one (`409`).

### Planned amounts (in `libs/shared-utils`, `plan.ts`)

- Per month, **gross income** is the planned income of top-level Income items, **Government** is the planned total of top-level Government items, and **net income** is gross minus Government. Only top-level items count, because a parent's amount already covers its children.
- The month's planned amounts include the yearly and one-time items that fall in that month. So in a bonus month, the percentage items grow with the bonus.
- A percentage item's amount is the percentage of its base **for the month**, rounded to whole TWD. A percentage of a monthly base means nothing per day or per week, so **daily and weekly items must be anchored to an amount** (a new plan API rule).
- **Parents and children:** a parent's planned amount is its own. Children are a breakdown of it, not added to it. In the review, a parent's actual and transfers **include its descendants'**.

### Envelopes (in `libs/shared-utils`, `ledger.ts`)

- An item's envelope runs over consecutive months where the active version has the item with rollover on and the **same cadence and reset cycle**. A change to any of those, or a gap, starts a new envelope at the new version's first day. The old leftover is dropped and not shown as a reset. A changed amount or carry target keeps the same envelope.
- Each cadence period gets its allotment from the version active in the month the period starts. The first period is clipped to the envelope's start.
- An envelope counts **only the item's own** expense lines and transfers, not its children's. Rolling children up would mix in their own envelopes and resets.
- A reset's `on_reset` comes from the version active on the reset date. `carry` adds the leftover (or overspend, which can be negative) to the target item on that date. Resets are computed by repeating the calculation until no carried amount changes. To guarantee that it finishes, **a version's carry chain must not loop** (a new plan API rule).
- Reports are "as of" a date: periods are clipped at that date and later records are ignored. The envelope shows the current period's leftover **before** any reset at the end of that day. For a month that hasn't ended, the monthly review shows the resets the month will produce if nothing more is spent.

### Report endpoints

- `GET /api/v1/finance/reports/envelopes?date=` lists every rollover item in the version active on that date, with its current period: allotment, carry-in, transfers, spent, and what's left.
- `GET /api/v1/finance/reports/checklist?date=` lists the items that aren't rollover items, for the period containing the date: today for daily, this week for weekly, this month for monthly, and yearly or one-time items that fall in this month. Each entry has the planned amount (to pre-fill batch entry) and what has been recorded on the item and its descendants.
- `GET /api/v1/finance/reports/monthly?month=` is the plan vs. actual review: the bases, a total per section (top-level items), every item of the active version with planned / transfers / actual, a planned yearly total and a year-to-date actual for yearly and one-time items, and the actuals that no item of the version covers.
- `GET /api/v1/finance/reports/budget-transfers?from=&to=` lists manual transfers and computed resets together in date order, so every leftover stays visible. A computed reset has no id, and its amount may be negative (an overspend carried forward).

## Consequences

- Every number can be traced back to records, plan versions and transfers. Editing any of them changes the reports immediately.
- Each report recalculates from the first plan version. That is fine at personal scale. Close Week (beta) can later persist resets as a starting point.
- Three plan rules are new: daily and weekly items must be amount-anchored, income items can't roll over or receive carries, and carry chains can't loop. Versions saved before this ADR that break them will fail on their next save.
