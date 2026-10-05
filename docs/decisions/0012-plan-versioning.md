# 0012. Plan versioning with stable item identity

- Status: Accepted
- Date: 2026-10-05

## Context
The budget plan is revised every year or half-year, or when the salary structure changes. Old versions must be kept. Records and reports must be able to follow "the same item" across versions.

## Decision
```
budget_plan_versions   (id, effective_from_month, note, ...)
budget_items           (id, section, ...)                -- stable identity across versions
budget_item_versions   (plan_version_id, budget_item_id, name, parent_item_id, cadence, cadence_month,
                        cadence_date, anchor, amount, percent, percent_base, rollover, reset_cycle,
                        on_reset, carry_to_item_id, sort_order, ...)
budget_item_overrides  (budget_item_version_id, month, amount)
```
- **`section`** is a fixed set of values: `income`, `government`, `offering`, `saving`, `expense`. It belongs to the item and **cannot change between versions**. Moving something to another section means creating a new item.
- **`name`** belongs to the item version, so an item can be renamed in a new version. Reports that span versions show the latest name.
- An item that has no row in a version is not part of that version's plan.
- **`anchor`** is `amount` or `percent`. The other value is calculated.
- **`percent_base`** defaults to income after government expenses. Other bases are allowed.
- **The active version for a month** is the one with the latest `effective_from_month` that is on or before that month. Older versions are read-only.
- **Record lines** reference `budget_items.id`, never a version.

## Consequences
- Renaming an item or moving it in the tree only affects one version, and history keeps working.
- Creating a new version copies the current item versions as a starting point.
