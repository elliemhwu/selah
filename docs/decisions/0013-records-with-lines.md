# 0013. Records with lines

- Status: Accepted. The adjustment rule is superseded by [0014](0014-record-dates-and-adjustments.md).
- Date: 2026-10-05

## Context
One payment sometimes needs to be split across several categories or budget items, e.g. a supermarket receipt. Two options were considered: (a) separate records grouped by a `group_id`, or (b) one record with several lines.

## Decision
Option (b):
- A **record** holds the shared fields: `type`, `occurred_on` (the local date, which budget periods use), an optional `occurred_at`, `account_id`, `currency` and `note`.
- **Record lines** hold the fields that differ per line: `amount`, `twd_amount`, `fx_rate`, `category_id`, `budget_item_id` and `note`.
- Amounts are always positive. The record type decides which direction the money moves.
- **Transfer:** one line holds the amount out. The record's `counter_account_id` and `counter_amount` hold the amount in, which keeps exchange rates exact.
- ~~**Adjustment:** one line holds the difference. The record also stores the target balance the user entered.~~ Superseded by [0014](0014-record-dates-and-adjustments.md): an adjustment stores only the target balance and has no lines.

## Consequences
- Shared fields can't diverge between lines.
- A normal entry is a record with one line.
- Reports and budget totals sum **lines**, joined to their record.
