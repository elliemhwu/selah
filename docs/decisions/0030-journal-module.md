# 0030. The Journal module: rows in the store, rules in journal-core, each module under its own route

- Status: Accepted
- Date: 2026-10-21
- Builds on: [0029](0029-generic-row-store-and-two-builds.md) (row store, two builds), [0026](0026-finance-core-and-device-store.md) (rules as pure functions), [0003](0003-schema-per-module.md) (schema per module), [0022](0022-forms-are-routes.md) (forms are routes)
- Design: [docs/selah-journal-framework.md](../selah-journal-framework.md)

## Context

Journal is Selah's second module (stage C of the roadmap). Its design is in the framework doc. The kickoff asked for per-feature CRUD endpoints, a `GET /journals/:id` that returns a page in one call, libraries under `libs/journal/*`, `scope:*` tags per module, and Finance moved from the app root to `/finance`.

Since [0029](0029-generic-row-store-and-two-builds.md), features are written once, in the app, and the API is a generic row store; Finance's screens live in `apps/web`, with its rules in a flat `libs/finance-core`. The `scope:*` tags already mean the platform (`scope:web`, `scope:api`, `scope:shared`).

## Decision

**Decided by the owner (2026-10-21)**

- **Journal follows ADR 0029, not CRUD endpoints.** The `journal` schema's tables are rows in the store: a migration, a row DTO and a table mapper each, registered in `StoreService`. The app holds every row in memory, so the Dear Diary page needs no aggregate endpoint: a pure `diaryPage()` function builds it from the rows. Linking a journal to a moment is a row update.
- **Journal follows Finance's layout.** Its screens live in `apps/web/src/app/journal/`, its rules and selectors in `libs/journal-core` (pure functions, like `finance-core`).
- **Modules are kept apart by a third tag axis**, `module:finance`, `module:journal` and `module:shared`. A module's libraries depend only on their own module and shared ones. Inside `apps/web`, an import rule keeps `finance/` and `journal/` from importing each other.
- **Each module has its own route.** Finance moves to `/finance` and Journal is at `/journal`, both lazy-loaded with `loadChildren`. `/` is a small home page with an entry to each. The `/selah/` prefix stays in the deployment's base href, not in route paths. Old Finance links redirect to `/finance/...`.
- **Memo composers are form routes** ([0022](0022-forms-are-routes.md)), in the memo's paper colour.

**Chosen during the discussion**

- **Settings stays at `/settings`**, for the whole app, since backups hold every module. The category forms move to `/finance/categories/...`, and Finance's bottom navigation moves from the app shell into a Finance layout.
- **`date_precision` is a CHECK constraint** with its values in `libs/shared-types`, checked against the SQL by a test, like Finance's value sets. It is not a Postgres enum.
- **No owner columns**: Selah has one user and no accounts ([0028](0028-local-only.md)).
- **Photos wait for the next phase.** Selah has no file storage yet, on the device or in the API.
- **Deleting cascades as soft deletes**: deleting a journal deletes its comments and god notes; deleting a moment unlinks its journals and deletes its comments.
- **A new entry is saved on its first keystroke** and autosaves after a short pause. A page left empty is never saved.
- **Bodies stay in their own columns**, with no copies such as a stored excerpt, and nothing logs them, so encrypting them later changes one column per table.
- **Memo side and tilt come from a hash of the memo id**, computed in the app. No placement is stored.

## Consequences

- Journal works in both builds and offline with no extra work, and the .NET port gains four more tables to store, not endpoints.
- Backups include the journal tables. Older backups, without them, still restore.
- Nx can't enforce boundaries between folders of one app, so the in-app import rule carries that part. Moving a module's screens into libraries remains possible later, once the shared web pieces (`DeviceStore`, `ui/`) move to a library of their own.
- The `/journal` route is where the module lock (`canMatch`) will go.
