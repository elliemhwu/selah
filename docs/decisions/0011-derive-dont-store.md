# 0011. Calculate balances and rollovers instead of storing them

- Status: Accepted
- Date: 2026-10-05

## Context
Account balances, budget rollover and resets, and checklist status all depend on records. Users catch up on entries and edit past records, so stored totals would easily get out of date.

## Decision
These values are **calculated on read** and never stored:
- **Account balance:** opening balance plus the account's records, by type.
- **Envelope balance for rollover items:** planned amount per period, minus spending, plus carry-in.
- **Resets:**
  - Each rollover item has a `reset_cycle` (`never` / `week` / `month` / `year`).
  - Each also has an `on_reset` action: `drop`, or `carry` into another budget item.
  - The reset shows up in reports as a budget transfer of kind `reset`, dated at the end of the period.
- **Checklist status:** whether a record line exists for the item in the period.

The rollover math is a pure function in `libs/shared-utils` ([0005](0005-finance-math-in-shared-utils.md)).

## Consequences
- Editing a past record updates everything that depends on it.
- At personal data volume, calculating on read is fast enough. Add caching only if it's measurably needed.
- The beta Close Week / Close Month feature may later **persist** reset transfers to lock a period. Once a period is persisted, the persisted values are used instead of computed ones.
