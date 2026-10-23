# 0016. A record's currency must fit its account

- Status: Accepted
- Date: 2026-10-06

## Context
A record line stores its `amount` in the record's currency and its `twd_amount` in TWD ([0006](0006-money-representation.md)). Account balances are derived from lines ([0011](0011-derive-dont-store.md)). If a JPY expense is posted to a USD account, neither stored amount is in USD, so the balance change would be unknown.

## Decision
A record may be posted to an account only if:
- the record's currency **equals** the account's currency, so the line's `amount` moves the balance, or
- the account is **TWD**, so the line's `twd_amount` moves the balance.

Any other combination is rejected. For example, a JPY expense on a USD card is entered in USD, as the statement shows it.

## Consequences
- This covers cash and accounts in any currency, and TWD cards used abroad, with no extra column.
- The API validates the rule on create and update. `isRecordCurrencyAllowed` in `libs/shared-utils` is the single implementation.
- If foreign cards charging other currencies become common, a later ADR can add an `account_amount` to lines.
