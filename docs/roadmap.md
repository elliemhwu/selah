# Roadmap & Status

The single source of truth for **where development stands**. Update it in the same branch as the work.

_Last updated: 2026-10-07_

## Current state

- **Phase 0 (requirements):** done.
- **Phase 1 (schema):** done. The `core` and `finance` schemas are SQL migrations in `db/migrations/`, checked against Postgres 18. `pnpm db:migrate` applies them with dbmate.
- **Phase 2 (workspace):** done. Nx 23, Angular 22 PWA, NestJS 11 with Swagger, the three libs, Postgres 18 in Docker Compose, dbmate and Kysely. A health endpoint proves the whole path: web → proxy → API → database.
- **GitHub:** `elliemhwu/selah`, with `main` and `develop` branches.

- **Phase 3 (finance math):** done. `libs/shared-utils` has money and rounding, percentages, FX, calendar dates, cadence conversion, rollover envelopes with resets, and account balances, with 90 unit tests. `libs/shared-types` holds the shared value sets, and a test checks them against the SQL CHECK constraints.

- **API client:** DTO types generated from the OpenAPI contract with openapi-typescript; the web app calls the API with plain `HttpClient` ([ADR 0015](decisions/0015-api-client-generation.md)). The health check already uses them. Every project now has a `typecheck` target.

- **Phase 4 (finance API):** done. API conventions are in [ADR 0017](decisions/0017-api-conventions.md). Accounts (with derived balances), categories, records with lines (single and batch upsert, filtered lists, last-used FX rates), the budget plan (whole-version saves, older versions read-only, active version per month; [ADR 0018](decisions/0018-plan-api.md)), manual budget transfers, and the reports: envelopes, checklist, monthly plan vs. actual, and transfers with computed resets ([ADR 0019](decisions/0019-budget-transfers-and-reports.md)). The planned-amount and envelope math is in `libs/shared-utils` (`plan.ts`, `ledger.ts`). Every endpoint has HTTP integration tests against a `selah_test` database.

- **Phase 5 (web UI):** in progress. The UI foundation is in [ADR 0020](decisions/0020-web-ui-foundation.md): Angular Material 3, `@angular/localize` with English as the only locale so far, and lazy-loaded feature routes. Done: the app shell (top bar, bottom navigation, offline banner) and the home screen. It shows what's left in each envelope and this period's checklist (tap to record one item, or select several for batch entry), and has a quick "+" record form for single-line income and expenses, foreign currencies included. Records, Budget, Review and Accounts are placeholders for now.

**Next step:** Phase 5b, the Accounts screen and the budget editor on `feat/finance-web-budget`. Until they exist, the home screen has no data to show unless it's entered through the API. After that: the Records screen (list, the full form with split lines, transfers and adjustments), then the monthly review. The open questions below are still waiting for the owner.

## Phases (Finance MVP)

| #   | Phase                                                                                                                                 | Branch                      | Status                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------- |
| 0   | Requirements discussion → [requirements.md](finance/requirements.md)                                                                  | `feat/finance-requirements` | ✅ Done                |
| 0b  | Project docs for multi-device development (README, CLAUDE.md, CONTRIBUTING, ADRs)                                                     | `feat/finance-requirements` | ✅ Done                |
| 1   | DB schema decisions and DDL (`finance`, `core` schemas)                                                                               | `feat/finance-schema`       | ✅ Done                |
| 2   | Workspace scaffold: Nx, Angular, NestJS, libs, Docker Postgres, `.nvmrc`, `.env.example`, Swagger                                     | `feat/workspace-setup`      | ✅ Done                |
| 3   | `libs/shared-utils` finance math with tests: money, percentages, cadence, rollover/reset, FX                                          | `feat/finance-utils`        | ✅ Done                |
| 4   | NestJS finance module design and implementation: accounts, categories, plan and items, records, budget transfers, reports             | `feat/finance-api-*`        | ✅ Done                |
| 5   | Angular UI design and implementation: home, record form and batch entry, checklist, budget editor, monthly review, accounts, settings | `feat/finance-web-*`        | 🟡 Shell and home done |
| 6   | PWA polish, then deployment planning                                                                                                  | —                           | ⬜                     |

Phases 1 and 2 can be swapped. The schema DDL can be written before the workspace exists, because the migrations are plain SQL.

## Beta / later

- Close Week / Close Month: persist computed resets as `reset` budget transfers. See requirements §5.
- Offline sync. The schema is already prepared ([ADR 0007](decisions/0007-offline-ready-data-conventions.md)).
- Deployment and phone access.
- Migrating `apps/api` to .NET.
- Revisit the API client approach when the frontend grows: plain `HttpClient` vs. a typed wrapper, openapi-fetch or openapi-generator ([ADR 0015](decisions/0015-api-client-generation.md)).

## Open questions

- **Rollover example in requirements §3.1:** "daily food of 185 with 150 spent leaves 210 available the next day." By the rule as described, the next day has 185 + 35 = **220**. The code does 220. Is the example a typo, or is there a rule missing?
- **Choices made in [ADR 0019](decisions/0019-budget-transfers-and-reports.md), to confirm:**
  - Percentage items are based on the whole month's planned income, so they grow in a bonus month. The alternative is a base that leaves out yearly and one-time income.
  - A rollover envelope counts only the item's own records, not its children's.
  - Changing an item's cadence or reset cycle in a new version starts a fresh envelope and drops the old leftover.
- **`percent_base` values:** the schema allows `net_income` (default) and `gross_income`. Add others, such as a parent item, when needed.
