# Roadmap & Status

The single source of truth for **where development stands**. Update it in the same branch as the work.

_Last updated: 2026-10-31_

## Current state

- **Phase 0 (requirements):** done.
- **Phase 1 (schema):** done. The `core` and `finance` schemas are SQL migrations in `db/migrations/`, checked against Postgres 18. `pnpm db:migrate` applies them with dbmate.
- **Phase 2 (workspace):** done. Nx 23, Angular 22 PWA, NestJS 11 with Swagger, the three libs, Postgres 18 in Docker Compose, dbmate and Kysely. A health endpoint proves the whole path: web → proxy → API → database.
- **GitHub:** `elliemhwu/selah`, with `main` and `develop` branches.

- **Phase 3 (finance math):** done. `libs/shared-utils` has money and rounding, percentages, FX, calendar dates, cadence conversion, rollover envelopes with resets, and account balances, with 90 unit tests. `libs/shared-types` holds the shared value sets, and a test checks them against the SQL CHECK constraints.

- **API client:** DTO types generated from the OpenAPI contract with openapi-typescript; the web app calls the API with plain `HttpClient` ([ADR 0015](decisions/0015-api-client-generation.md)). The health check already uses them. Every project now has a `typecheck` target.

- **Phase 4 (finance API):** done. API conventions are in [ADR 0017](decisions/0017-api-conventions.md). Accounts (with derived balances), categories, records with lines (single and batch upsert, filtered lists, last-used FX rates), the budget plan (whole-version saves, older versions read-only, active version per month; [ADR 0018](decisions/0018-plan-api.md)), manual budget transfers, and the reports: envelopes, checklist, monthly plan vs. actual, and transfers with computed resets ([ADR 0019](decisions/0019-budget-transfers-and-reports.md)). The planned-amount and envelope math is in `libs/shared-utils` (`plan.ts`, `ledger.ts`). Every endpoint has HTTP integration tests against a `selah_test` database.

- **Phase 5 (web UI):** done and merged into `develop`. The UI foundation is in [ADR 0020](decisions/0020-web-ui-foundation.md) (`@angular/localize` with English as the only locale so far, lazy-loaded feature routes), and the look is the **Linen ledger** style in [ADR 0021](decisions/0021-linen-ledger-ui.md): the Angular CDK with our own small components, no Material. Done: the app shell (top bar, bottom navigation, offline banner) and the home screen. It shows what's left in each envelope and this period's checklist (tap to record one item, or select several for batch entry), and has a quick "+" record form for single-line income and expenses, foreign currencies included. The Accounts screen lists derived balances with a total per currency, and adds, edits and deletes accounts, records transfers (with separate sent and received amounts for exchanges) and adjusts balances. Every form is a route that fills the phone screen and is a centred column on a laptop ([ADR 0022](decisions/0022-forms-are-routes.md)). The budget editor shows the plan for any month (sections, the item tree, net income, Unallocated), edits a draft kept on the device and saves it as a whole version, edits items (cadence, amount or percentage, rollover and reset, different-month amounts), and starts new versions from the version log ([ADR 0023](decisions/0023-budget-editor-draft.md)). The Records screen lists a month's records by day (spent and received totals, filters for account, category, budget item and type, kept in the address), and every record opens for editing: income and expenses in the entry form, which now splits a receipt into lines and takes an optional time, and transfers and adjustments in their own forms; all can be deleted. The monthly review compares plan and actual per section and item (left, over, still to come, moved, and the year so far for yearly and one-time items), links each item to its records, and lists what no item covers and the month's budget transfers with computed resets. Settings ([ADR 0024](decisions/0024-settings-resource.md)) has a small API (`GET`/`PUT /api/v1/core/settings`, one resource with no id) and a screen linked from the home masthead. The week start day and the default currency save as soon as they change, and each category in the tree opens in its own form route. New accounts and entries start in the default currency, and category pickers list categories in tree order. Manual budget transfers have their own form (`/budget/transfers/new`, `/budget/transfers/:id`): whole TWD between two non-income items of the plan for that date, showing what's left in the "from" envelope. A new transfer is dated the last day of the previous month (requirements §3.2). From the review, it is dated inside the month shown, and the review's manual transfers open for editing. Catch-up entry (`/records/catch-up`, from the Records screen) goes one day at a time, starting yesterday. Each day shows what's already recorded, takes rows of income and expenses on one account (in its currency, with one rate for the day), and saves them all or nothing before moving to the next day. Rows without an amount are skipped.

- **Offline-first** (decided 2026-10-14, [ADR 0025](decisions/0025-offline-first.md), accepted): the device holds all the data, and the rules and reports run on the device. The work went in two steps: device storage, then backup and hosting.

- **Local only** (decided 2026-10-15, [ADR 0028](decisions/0028-local-only.md), accepted): Selah stays a phone app with no sync, server or accounts. When it outgrows one device, it becomes a hosted service with accounts, as a stage of its own, not self-hosting. The drafted sync work (closed PRs #25 and #26) is kept on its branches for reference.

- **Two builds, one app** (decided 2026-10-16, [ADR 0029](decisions/0029-generic-row-store-and-two-builds.md), accepted): every feature is written once, in the app. The release build picks the storage: the **device build** (Pages, the phone) keeps the data in IndexedDB, and the **API build** (local `nx serve web`) keeps it in Postgres through the API. The two don't share data. The API becomes a generic row store that loads and saves rows; the per-feature endpoints go. New modules come before a reachable server, and the API moves to .NET before it goes online.

- **Phase 6a, step 1 (shared finance core):** done. `libs/finance-core` holds the rules and reports as pure functions ([ADR 0026](decisions/0026-finance-core-and-device-store.md)), and the API services only load data, call them, and save. All 123 integration tests pass unchanged.

- **Phase 6a, step 2 (device store):** done. Every row lives in IndexedDB through Dexie; `DeviceStore` loads it into memory at start and follows changes from other tabs. `finance-api.ts` keeps its shape but reads the device and runs the `finance-core` rules before saving, and settings moved to the device too. The app no longer needs the API: the "can't reach the server" banner became a warning that shows only if the device's storage can't be opened. Web tests seed an in-memory store instead of stubbing HTTP.

- **Phase 6b (backup and hosting):** done ([ADR 0027](decisions/0027-backups-and-hosting.md)). Settings downloads a backup file of everything on the device and restores one, replacing everything after a second tap; Home reminds to back up after 30 days without one. The app asks the browser to keep its storage and says whether it did. Selah has its own icon (a fermata over a ledger rule, `pnpm icons`), and a GitHub Action publishes the app to https://elliemhwu.github.io/selah/ on every push to `main`. The owner chose to start fresh: nothing from the local Postgres is brought over.

- **Stage A, step 1 (row store):** done. `apps/api` is a generic row store: `GET`, `PATCH` and `PUT /api/v1/store` load, save and replace rows in the shape the app keeps, in the existing typed tables. The per-feature endpoints, their services and their 123 integration tests are gone; 13 store tests cover every table round trip, line and item replacement, soft deletes, all-or-nothing saves, database constraints, validation and a large restore. A migration lets the client's `updated_at` stand. The app's view types now come from `finance-core` and the row DTOs.

- **Stage A, step 2 (API build):** done. `ApiStorage` implements the same storage interface as IndexedDB over `/api/v1/store`, and the build picks it: the development build (`nx serve web`, with the API and Postgres) keeps the data in Postgres; the release build and `nx serve web -c device` keep it on the device. Unit tests run in the device build. The shell says when the server can't be reached, and the API build doesn't ask the browser to keep storage. Stage A is done.

- **Stage B (first release):** `develop` was merged into `main` (PR #32). Since [ADR 0031](decisions/0031-publish-on-release.md), the app is published to Pages when a GitHub release is created from `main`, not on every merge. The first tagged release carries Finance and the first Journal phase; the owner tries it on a phone and a laptop for several days.

- **Stage C (Journal module):** started 2026-10-21. The design is in [selah-journal-framework.md](selah-journal-framework.md), and the structure in [ADR 0030](decisions/0030-journal-module.md): the journal tables are rows in the store, the rules are in `libs/journal-core`, and each module has its own route (Finance at `/finance`, Journal at `/journal`, a home page at `/`). The first phase is built, in four stacked PRs: the docs; Finance moved to `/finance` (old links redirect); the `journal` schema, `journal-core` and the store tables, with integration tests; and the journal list, the Dear Diary page (lined page with autosave, memos placed from their id, the "Stick a memo" bar), the memo forms and a Life placeholder. The second phase ([ADR 0032](decisions/0032-moment-pages.md)) makes a moment a page of its own: Life lists moments with **New moment**, a moment starts blank and saves itself once it has a title, and its journal memo writes a new entry for it or moves an existing one to it; its entries show as memos around it. The schema doesn't change. Photos, people and places, import, the module lock and encryption come later.

- **Stage C2 (Planner module):** designed 2026-10-31. The design is in [selah-planner-framework.md](selah-planner-framework.md), the v1 build spec in [planner/v1-spec.md](planner/v1-spec.md), and the structure in [ADR 0033](decisions/0033-planner-module.md): the `planner` tables are rows in the store, the rules and the Today and week views are in `libs/planner-core`, and the module lives at `/planner`. v1 replaces Notion for task management: Areas, optional Groups, Projects and Tasks; plans by day, week or month; queues and Study now; Today with Overdue, Slipped and Due soon; the weekly sit-down. Built so far: the `planner` schema, `libs/planner-core` (rules and views, tested against the spec's acceptance scenarios), the eight store tables in the API, the device store and backups, and the screens at `/planner`: Today, Inbox, Projects (areas, groups, projects), a project and its queue, the task, Plan and Continue-when forms, Study now and the weekly sit-down. Tasks are reordered by holding and dragging, and a queue can be copied as a new project. v1 is complete and merged into `develop` (#42–#43).

- **Stage C3 (Desktop layout):** started 2026-10-31, in [ADR 0034](decisions/0034-desktop-layout-and-merging-backups.md). Finance, Journal and Planner are planned on a Mac or PC in the same PWA, installed from the browser, with no server. From 1024px wide a sidebar lists the modules and the current module's sections in place of the bottom navs, and Today shows the coming days beside it. Data moves between the phone and the computer as backup files: choosing a backup now offers **Merge**, which keeps the newer copy of each row and removes nothing, as well as Replace. Sync waits for stage E. Merged into `develop` (#44).

**Next step:** merge `develop` into `main` and release v0.3.0 (Planner v1 and the desktop layout). Then install it on a laptop as well as the phone and use the Planner in place of Notion for a week: plan on Saturday, work from Today, move data between the two with Merge. Photos and import for the Journal come after.

## Phases (Finance MVP)

| #   | Phase                                                                                                                                                   | Branch                      | Status  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------- |
| 0   | Requirements discussion → [requirements.md](finance/requirements.md)                                                                                    | `feat/finance-requirements` | ✅ Done |
| 0b  | Project docs for multi-device development (README, CLAUDE.md, CONTRIBUTING, ADRs)                                                                       | `feat/finance-requirements` | ✅ Done |
| 1   | DB schema decisions and DDL (`finance`, `core` schemas)                                                                                                 | `feat/finance-schema`       | ✅ Done |
| 2   | Workspace scaffold: Nx, Angular, NestJS, libs, Docker Postgres, `.nvmrc`, `.env.example`, Swagger                                                       | `feat/workspace-setup`      | ✅ Done |
| 3   | `libs/shared-utils` finance math with tests: money, percentages, cadence, rollover/reset, FX                                                            | `feat/finance-utils`        | ✅ Done |
| 4   | NestJS finance module design and implementation: accounts, categories, plan and items, records, budget transfers, reports                               | `feat/finance-api-*`        | ✅ Done |
| 5   | Angular UI design and implementation: home, record form and batch entry, checklist, budget editor, monthly review, accounts, settings                   | `feat/finance-web-*`        | ✅ Done |
| 6a  | Offline-first, device storage: IndexedDB, rules and reports in shared functions, every screen off the API ([ADR 0025](decisions/0025-offline-first.md)) | `feat/offline-*`            | ✅ Done |
| 6b  | Backup and hosting: export/import, persistent storage, install polish, free static hosting                                                              | `feat/offline-*`            | ✅ Done |

Phases 1 and 2 can be swapped. The schema DDL can be written before the workspace exists, because the migrations are plain SQL.

## Stages after the Finance MVP ([ADR 0029](decisions/0029-generic-row-store-and-two-builds.md))

| #   | Stage                                                                                                                                          | Status            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| A   | Generic row store in `apps/api` replacing the per-feature endpoints; `ApiStorage` and the API build; local `serve` runs the web app on the API | ✅ Done           |
| B   | Release v0.1.0 to Pages (device build) and test on a phone for a few days; fix what comes up in small PRs; CI checks on PRs                    | Released; testing |
| C   | Journal module, written once and working in both builds ([ADR 0030](decisions/0030-journal-module.md))                                         | 🚧 In progress    |
| C2  | Planner module v1 ([ADR 0033](decisions/0033-planner-module.md)): tasks, queues, Today, the weekly sit-down                                    | ✅ Done; v0.3.0   |
| C3  | Desktop layout and merging backups ([ADR 0034](decisions/0034-desktop-layout-and-merging-backups.md))                                          | ✅ Done; v0.3.0   |
| D   | Feature freeze at a steady point; port the API to ASP.NET (or publish the NestJS one)                                                          | Later             |
| E   | Hosted service: sign-in, profile, sync between devices, where it runs ([ADR 0028](decisions/0028-local-only.md))                               | Later             |

## Beta / later

- Switchable themes: the Paper (light) and Evening (dark) directions from the UI comparison, as extra token sets ([ADR 0021](decisions/0021-linen-ledger-ui.md)). An idea only, not planned.
- Close Week / Close Month: persist computed resets as `reset` budget transfers. See requirements §5.
- Native app: wrap the same build with Capacitor when the App Store, widgets or background tasks are wanted ([ADR 0029](decisions/0029-generic-row-store-and-two-builds.md)).
- Revisit the API client approach ([ADR 0015](decisions/0015-api-client-generation.md)) at stage D.

## Open questions

- **Choices made in [ADR 0019](decisions/0019-budget-transfers-and-reports.md), to confirm:**
  - Percentage items are based on the whole month's planned income, so they grow in a bonus month. The alternative is a base that leaves out yearly and one-time income.
  - A rollover envelope counts only the item's own records, not its children's.
  - Changing an item's cadence or reset cycle in a new version starts a fresh envelope and drops the old leftover.
- **`percent_base` values:** the schema allows `net_income` (default) and `gross_income`. Add others, such as a parent item, when needed.
