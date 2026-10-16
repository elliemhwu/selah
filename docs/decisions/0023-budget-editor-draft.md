# 0023. The budget editor works on one draft kept on the device

- Status: Accepted
- Date: 2026-10-07

## Context

The plan API saves a whole version at a time ([0018](0018-plan-api.md)). The editor spreads that version across several routes: the plan, one route per item, and the version log ([0022](0022-forms-are-routes.md)). Edits must survive moving between those routes, a reload, and the phone switching apps, without reaching the server half-done.

## Decision

- **One draft at a time** (`PlanDraft`) holds the version being edited: its id, start month, note, items, and the items as they were when editing began.
- The draft lives in **`localStorage`**, so it survives reloads and app switches. If storage is unavailable, it lives in memory only.
- **Item routes change the draft only.** "Done" returns to the plan; nothing is sent yet. The plan shows "Editing · N changes not saved", with New and Edited tags on items. Discard asks twice.
- **Save plan** sends the whole version in one `PUT`. Rule violations (`items.N.field`) are shown on their items and the draft is kept. A successful save clears the draft.
- **A new version** is a copy of the newest one with a fresh id and a later start month, edited the same way. The very first plan starts empty from the current month.
- **The plan shows one month at a time**, with a month stepper, because percentages, yearly and one-time items, and overrides all depend on the month. The numbers come from `planMonth()` in `libs/shared-utils` ([0019](0019-budget-transfers-and-reports.md)). The remainder is shown as **Unallocated**: net income that no Offerings, Savings or Expenses item claims.
- The item form only offers what the plan rules allow: no percentage for income or for daily and weekly items, rollover only for daily, weekly and monthly non-income items, reset cycles that fit the cadence, and different-month amounts for monthly items only. The server still checks everything on save.

## Consequences

- Editing is safe to leave halfway: nothing changes on the server until Save plan.
- The draft is per device. Editing on a phone and a laptop at the same time gives two drafts, and whichever is saved second overwrites the first. That is acceptable for a single user. Offline sync may revisit it.
- Removing an item also removes the items under it. An item that carries into a removed item is reported by the server on save.
