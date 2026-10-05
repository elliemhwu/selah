# 0006. Money representation

- Status: **Proposed**
- Date: 2026-10-05

## Context
JS `number` is a binary float, so `0.1 + 0.2 !== 0.3`. Amounts must be exact everywhere, and must map cleanly to C# `decimal`. Supported currencies: TWD, JPY, EUR, GBP, USD.

## Decision
- **Database:** amounts are `NUMERIC(14,2)`; exchange rates are `NUMERIC(18,8)`; currencies are `CHAR(3)` ISO codes, checked against the supported list.
- **API:** amounts are **decimal strings**, e.g. `"1234.50"`, never JSON numbers.
- **Calculation:** `libs/shared-utils` converts to integer cents (`bigint`) internally and converts back to strings for output.
- **Display:** TWD and JPY are shown without decimals; EUR, GBP and USD with 2 decimals.
- **Budget figures** are always in TWD. Foreign-currency record lines store both `amount` (original) and `twd_amount`.

## Consequences
- `pg` returns `NUMERIC` as strings by default. Keep it that way and never parse to `number`.
- Display rounding is a presentation concern; the stored values keep 2 decimals.
