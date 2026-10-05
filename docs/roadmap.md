# Roadmap & Status

The single source of truth for **where development stands**. Update it in the same branch as the work.

_Last updated: 2026-10-05_

## Current state

- **Phase 0 (requirements):** done.
- **Phase 1 (schema):** done. The `core` and `finance` schemas are SQL migrations in `db/migrations/`, checked against Postgres 18. They are not yet wired to dbmate or Docker Compose (Phase 2).
- **Phase 2 (workspace):** done. Nx 23, Angular 22 PWA, NestJS 11 with Swagger, the three libs, Postgres 18 in Docker Compose, dbmate and Kysely. A health endpoint proves the whole path: web → proxy → API → database.
- **GitHub:** `elliemhwu/selah`, with `main` and `develop` branches.

**Next step:** the owner reviews [ADR 0015](decisions/0015-api-client-generation.md) (*Proposed*). Then start Phase 3, the finance math in `libs/shared-utils`, on `feat/finance-utils`.

## Phases (Finance MVP)

| # | Phase | Branch | Status |
|---|---|---|---|
| 0 | Requirements discussion → [requirements.md](finance/requirements.md) | `feat/finance-requirements` | ✅ Done |
| 0b | Project docs for multi-device development (README, CLAUDE.md, CONTRIBUTING, ADRs) | `feat/finance-requirements` | ✅ Done |
| 1 | DB schema decisions and DDL (`finance`, `core` schemas) | `feat/finance-schema` | ✅ Done |
| 2 | Workspace scaffold: Nx, Angular, NestJS, libs, Docker Postgres, `.nvmrc`, `.env.example`, Swagger | `feat/workspace-setup` | ✅ Done |
| 3 | `libs/shared-utils` finance math with tests: money, percentages, cadence, rollover/reset, FX | `feat/finance-utils` | ⬜ |
| 4 | NestJS finance module design and implementation: accounts, categories, plan and items, records, budget transfers, reports | `feat/finance-api-*` | ⬜ |
| 5 | Angular UI design and implementation: home, record form and batch entry, checklist, budget editor, monthly review, accounts, settings | `feat/finance-web-*` | ⬜ |
| 6 | PWA polish, then deployment planning | — | ⬜ |

Phases 1 and 2 can be swapped. The schema DDL can be written before the workspace exists, because the migrations are plain SQL.

## Beta / later

- Close Week / Close Month: persist computed resets as `reset` budget transfers. See requirements §5.
- Offline sync. The schema is already prepared ([ADR 0007](decisions/0007-offline-ready-data-conventions.md)).
- Deployment and phone access.
- Migrating `apps/api` to .NET.

## Open questions

- **Records in a currency that isn't the account's, on a non-TWD account** (e.g. a JPY expense on a USD account): which amount moves the account balance? Same-currency records and TWD accounts work as designed (`amount` / `twd_amount`). Decide before the balance math in Phase 3.
- **`percent_base` values:** the schema allows `net_income` (default) and `gross_income`. Add others, such as a parent item, when needed.
