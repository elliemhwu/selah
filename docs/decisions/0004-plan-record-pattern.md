# 0004. Plan → Record pattern

- Status: Accepted
- Date: 2026-10-05

## Context
Across Selah, things are first planned and later happen. In Finance, a budget item is planned and expenses are recorded against it.

## Decision
- **Plans and records are stored independently.** Creating a record never changes the plan, and changing the plan never changes past records.
- A record links to the plan by reference. In Finance, a record line has an optional `budget_item_id` that points to the **stable** item identity ([0012](0012-plan-versioning.md)).
- **The UI connects them:**
  - Record from a plan item: amount, category and item are pre-filled.
  - Record under a budget: only the item is pre-filled.
  - Checklist batch create.
- **Plan vs. actual is a computed view**, not stored data.

## Consequences
- Whether something "has been recorded" (the checklist status) is calculated: does a line exist for that item in that period?
- Unplanned records are first-class. A record doesn't need a budget item.
