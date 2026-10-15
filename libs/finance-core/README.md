# finance-core

The finance rules and reports as pure functions ([ADR 0025](../../docs/decisions/0025-offline-first.md), [0026](../../docs/decisions/0026-finance-core-and-device-store.md)). The API and the device run the same code, so they accept the same input and give the same numbers.

- **Rules:** `prepareRecords`, `prepareAccount`, `prepareCategory`, `preparePlanVersion`, `prepareBudgetTransfer`, and the `assert…Deletable` checks. Each takes the input and the stored data it needs, returns the values to store, or throws `RuleViolationError` (with field errors), `ConflictError` or `NotFoundError`.
- **Reports:** `envelopesReport`, `checklistReport`, `monthlyReview`, `budgetMovements`, from plan versions, lines and manual transfers.
- **Lists:** record filters and ordering, last-used rates, transfer ordering, and account balances.

The money and date math these build on is in `libs/shared-utils` ([ADR 0005](../../docs/decisions/0005-finance-math-in-shared-utils.md)). No framework imports; the lint rule enforces it.

Run the tests with `pnpm nx test finance-core`.
