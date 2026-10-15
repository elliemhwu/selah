# Roadmap & Status

The single source of truth for **where development stands**. Update it in the same branch as the work.

_Last updated: 2026-10-15_

## Current state

- **Phase 0 (requirements):** done.
- **Phase 1 (schema):** done. The `core` and `finance` schemas are SQL migrations in `db/migrations/`, checked against Postgres 18. `pnpm db:migrate` applies them with dbmate.
- **Phase 2 (workspace):** done. Nx 23, Angular 22 PWA, NestJS 11 with Swagger, the three libs, Postgres 18 in Docker Compose, dbmate and Kysely. A health endpoint proves the whole path: web → proxy → API → database.
- **GitHub:** `elliemhwu/selah`, with `main` and `develop` branches.

- **Phase 3 (finance math):** done. `libs/shared-utils` has money and rounding, percentages, FX, calendar dates, cadence conversion, rollover envelopes with resets, and account balances, with 90 unit tests. `libs/shared-types` holds the shared value sets, and a test checks them against the SQL CHECK constraints.

- **API client:** DTO types generated from the OpenAPI contract with openapi-typescript; the web app calls the API with plain `HttpClient` ([ADR 0015](decisions/0015-api-client-generation.md)). The health check already uses them. Every project now has a `typecheck` target.

- **Phase 4 (finance API):** done. API conventions are in [ADR 0017](decisions/0017-api-conventions.md). Accounts (with derived balances), categories, records with lines (single and batch upsert, filtered lists, last-used FX rates), the budget plan (whole-version saves, older versions read-only, active version per month; [ADR 0018](decisions/0018-plan-api.md)), manual budget transfers, and the reports: envelopes, checklist, monthly plan vs. actual, and transfers with computed resets ([ADR 0019](decisions/0019-budget-transfers-and-reports.md)). The planned-amount and envelope math is in `libs/shared-utils` (`plan.ts`, `ledger.ts`). Every endpoint has HTTP integration tests against a `selah_test` database.

- **Phase 5 (web UI):** done and merged into `develop`. The UI foundation is in [ADR 0020](decisions/0020-web-ui-foundation.md) (`@angular/localize` with English as the only locale so far, lazy-loaded feature routes), and the look is the **Linen ledger** style in [ADR 0021](decisions/0021-linen-ledger-ui.md): the Angular CDK with our own small components, no Material. Done: the app shell (top bar, bottom navigation, offline banner) and the home screen. It shows what's left in each envelope and this period's checklist (tap to record one item, or select several for batch entry), and has a quick "+" record form for single-line income and expenses, foreign currencies included. The Accounts screen lists derived balances with a total per currency, and adds, edits and deletes accounts, records transfers (with separate sent and received amounts for exchanges) and adjusts balances. Every form is a route that fills the phone screen and is a centred column on a laptop ([ADR 0022](decisions/0022-forms-are-routes.md)). The budget editor shows the plan for any month (sections, the item tree, net income, Unallocated), edits a draft kept on the device and saves it as a whole version, edits items (cadence, amount or percentage, rollover and reset, different-month amounts), and starts new versions from the version log ([ADR 0023](decisions/0023-budget-editor-draft.md)). The Records screen lists a month's records by day (spent and received totals, filters for account, category, budget item and type, kept in the address), and every record opens for editing: income and expenses in the entry form, which now splits a receipt into lines and takes an optional time, and transfers and adjustments in their own forms; all can be deleted. The monthly review compares plan and actual per section and item (left, over, still to come, moved, and the year so far for yearly and one-time items), links each item to its records, and lists what no item covers and the month's budget transfers with computed resets. Settings ([ADR 0024](decisions/0024-settings-resource.md)) has a small API (`GET`/`PUT /api/v1/core/settings`, one resource with no id) and a screen linked from the home masthead. The week start day and the default currency save as soon as they change, and each category in the tree opens in its own form route. New accounts and entries start in the default currency, and category pickers list categories in tree order. Manual budget transfers have their own form (`/budget/transfers/new`, `/budget/transfers/:id`): whole TWD between two non-income items of the plan for that date, showing what's left in the "from" envelope. A new transfer is dated the last day of the previous month (requirements §3.2). From the review, it is dated inside the month shown, and the review's manual transfers open for editing. Catch-up entry (`/records/catch-up`, from the Records screen) goes one day at a time, starting yesterday. Each day shows what's already recorded, takes rows of income and expenses on one account (in its currency, with one rate for the day), and saves them all or nothing before moving to the next day. Rows without an amount are skipped.

- **Offline-first** (decided 2026-10-14, [ADR 0025](decisions/0025-offline-first.md), accepted): the device holds all the data, and the rules and reports run on the device. The server becomes a sync hub and backup. The work goes in three steps: device storage, then backup and hosting, then sync.

- **Phase 6a, step 1 (shared finance core):** done. `libs/finance-core` holds the rules and reports as pure functions ([ADR 0026](decisions/0026-finance-core-and-device-store.md)), and the API services only load data, call them, and save. All 123 integration tests pass unchanged.

- **Phase 6a, step 2 (device store):** done. Every row lives in IndexedDB through Dexie; `DeviceStore` loads it into memory at start and follows changes from other tabs. `finance-api.ts` keeps its shape but reads the device and runs the `finance-core` rules before saving, and settings moved to the device too. The app no longer needs the API: the "can't reach the server" banner became a warning that shows only if the device's storage can't be opened. Web tests seed an in-memory store instead of stubbing HTTP.

- **Phase 6b (backup and hosting):** done ([ADR 0027](decisions/0027-backups-and-hosting.md)). Settings downloads a backup file of everything on the device and restores one, replacing everything after a second tap; Home reminds to back up after 30 days without one. The app asks the browser to keep its storage and says whether it did. Selah has its own icon (a fermata over a ledger rule, `pnpm icons`), and a GitHub Action publishes the app to https://elliemhwu.github.io/selah/ on every push to `main`. The owner chose to start fresh: nothing from the local Postgres is brought over.

- **Phase 6c (sync):** in progress, with the protocol proposed in [ADR 0028](decisions/0028-sync-protocol.md). It works the same whichever server is chosen. **Step 1 (API):** done. `GET /api/v1/sync/changes?since=` returns every row changed since a cursor, deleted rows included, in the shapes the device stores. `API_ACCESS_TOKEN` makes every request but the health check need a bearer token, and `API_CORS_ORIGINS` lets the hosted app call the API. **Step 2 (device):** done. Every save queues its rows in an IndexedDB outbox in the same transaction. A sync pushes them in order through the API's own endpoints (records in batches of 50), then pulls what changed and keeps rows still waiting to be pushed. It runs when the app opens, a few seconds after a save, when the device is back online or the app back on screen, and from Settings, one tab at a time. Settings has a **Sync** section: connect with a server address and access token (everything already on the device is sent), see when it last synced and what's waiting, and handle changes the server refused (**Try again** or **Use the server's copy**). The shell points there when something couldn't sync. Restoring a backup on a connected device sends the restored rows to the server.

**Next step:** merge the open PRs, then `develop` into `main` to publish the app, and try it on a phone (install it, enter a few days, download a backup). Choose where the server runs (a free cloud or a home server), deploy the API there with `API_ACCESS_TOKEN` and `API_CORS_ORIGINS=https://elliemhwu.github.io`, confirm [ADR 0028](decisions/0028-sync-protocol.md), and connect a phone and a laptop. The open questions below are still waiting for the owner.

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
| 6c  | Sync with a server (free cloud or home server, to be chosen); its own ADR                                                                               | `feat/sync-*`               | 🟡      |

Phases 1 and 2 can be swapped. The schema DDL can be written before the workspace exists, because the migrations are plain SQL.

## Beta / later

- Switchable themes: the Paper (light) and Evening (dark) directions from the UI comparison, as extra token sets ([ADR 0021](decisions/0021-linen-ledger-ui.md)). An idea only, not planned.
- Close Week / Close Month: persist computed resets as `reset` budget transfers. See requirements §5.
- Migrating `apps/api` to .NET.
- Revisit the API client approach ([ADR 0015](decisions/0015-api-client-generation.md)) when sync is built (6c). Under [ADR 0025](decisions/0025-offline-first.md), screens read the device store and only sync calls the API.

## Open questions

- **Rollover example in requirements §3.1:** "daily food of 185 with 150 spent leaves 210 available the next day." By the rule as described, the next day has 185 + 35 = **220**. The code does 220. Is the example a typo, or is there a rule missing?
- **Choices made in [ADR 0019](decisions/0019-budget-transfers-and-reports.md), to confirm:**
  - Percentage items are based on the whole month's planned income, so they grow in a bonus month. The alternative is a base that leaves out yearly and one-time income.
  - A rollover envelope counts only the item's own records, not its children's.
  - Changing an item's cadence or reset cycle in a new version starts a fresh envelope and drops the old leftover.
- **`percent_base` values:** the schema allows `net_income` (default) and `gross_income`. Add others, such as a parent item, when needed.
