# 0014. Record dates and adjustments

- Status: Accepted
- Date: 2026-10-05
- Supersedes: the adjustment rule in [0013](0013-records-with-lines.md)

## Context

[0013](0013-records-with-lines.md) gives records an `occurred_on` date and an optional `occurred_at`, but doesn't say what type `occurred_at` is. It also stores an adjustment as **both** the target balance and a line holding the difference. That stored difference goes stale when an earlier record is edited, which breaks [0011](0011-derive-dont-store.md).

## Decision

- **Dates are local wall-clock values with no time zone.** `occurred_on` is a `DATE` and `occurred_at` is an optional `TIME`. Days, weeks and months are bucketed by the date where the money moved. For example, a lunch in Tokyo counts on the Tokyo date.
- **An adjustment stores only `target_balance`** on the record and has **no lines**. Its effect is calculated: the target balance minus the derived balance just before it. After the adjustment, the account balance is exactly the target, even if earlier records are edited later.
- **Transfers stay as in 0013:** one line holds the amount out, and the record's `counter_account_id` and `counter_amount` hold the amount in.

## Consequences

- Account balance math in `libs/shared-utils` treats an adjustment as "the balance becomes X", not "add Y".
- Records on the same date are ordered by `occurred_at`, then by `created_at`, to decide which records come before an adjustment. A record without a time counts as the end of its day.
- Reports that need the adjustment amount calculate it; they can't sum it from lines.
- Exact moments in time are not recorded. That's acceptable for a single-user personal finance app.
