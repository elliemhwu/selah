# journal-core

The Journal rules and page selectors as pure functions ([ADR 0030](../../docs/decisions/0030-journal-module.md)), run by the app before every save in both builds. The design is in [selah-journal-framework.md](../../docs/selah-journal-framework.md).

- **Rules:** `prepareJournal`, `prepareMoment`, `prepareComment`, `prepareGodNote`, and `deleteJournal` / `deleteMoment` with their cascades. Each takes the input and the rows the app holds, returns the values to store, or throws `RuleViolationError` (with field errors), `ConflictError` or `NotFoundError` from `libs/shared-utils`.
- **Pages:** `diaryPage` (a journal with its moment and memos), `journalList`, `momentList`, `momentPage`.

Bodies are kept as written and never appear in an error message. No framework imports, and no imports from Finance; the lint rules enforce both.

Run the tests with `pnpm nx test journal-core`.
