# 0026. Rules and reports in libs/finance-core; the device store uses Dexie

- Status: Accepted. The API no longer runs `finance-core`; it stores the rows the app sends ([0029](0029-generic-row-store-and-two-builds.md)).
- Date: 2026-10-15
- Builds on: [0025](0025-offline-first.md) (offline-first), [0005](0005-finance-math-in-shared-utils.md) (finance math)

## Context

Under [0025](0025-offline-first.md), the device holds all the data, and the rules and reports run there as well as in the API. Two technical choices follow: where the shared rules and reports live, and how the web app keeps its data in IndexedDB.

## Decision

**`libs/finance-core`** holds the rules and the reports as pure functions, apart from `libs/shared-utils`:

- `shared-utils` stays the finance math of [0005](0005-finance-math-in-shared-utils.md) (money, dates, cadence, rollover, balances). `finance-core` builds on it: the record, account, category, plan and budget transfer rules, the reports, and the list helpers (record filters and order, last-used rates, transfer order).
- Each function takes exactly what it reads as plain values, such as the input plus lookups, or plan versions, lines and transfers. It returns the values to store or the report, or it throws `RuleViolationError`, `ConflictError` or `NotFoundError`. Reports ignore rows outside the dates they need, so a caller can pass more than that.
- **The API keeps its targeted SQL** and passes the results in. **The device passes the rows it holds in memory.** Both run the same code, so they give the same answers and the same error messages. The API's integration tests check that the move changed nothing.
- Months are `YYYY-MM` inside `finance-core`, as in the API and the screens. The API converts to and from its first-of-month columns at the repository boundary.
- The same lint rule as `shared-utils` keeps it free of framework imports, and the module boundaries let it depend only on the shared types and utils. The .NET port reimplements it.

**The device store uses [Dexie](https://dexie.org)** on IndexedDB, rather than the thinner `idb` wrapper:

- It provides schema versions with upgrade functions, which the store needs as the data changes, plus transactions across tables and live queries that notice changes from other tabs.
- A single user's data is small (a few thousand records a year). So the web app loads every live row into memory at start, runs the `finance-core` functions over it, and writes changes back through Dexie. Rows are stored in the shapes the API returns, with `deletedAt` for soft deletes.

## Consequences

- One copy of every rule. A rule changes in one place, with its unit tests in `finance-core` and its HTTP tests in the API.
- Rules the database enforced by itself, such as unique account and category names, become explicit checks for the device. Their messages live in `finance-core`, and the API's unique indexes stay as a backstop.
- Keeping everything in memory is simple and fast at this size. If the data ever grows large, reports can move to Dexie queries without changing the `finance-core` functions.
- Dexie adds about 30 KB to the web bundle.
