# Roadmap & Status

The single source of truth for **where development stands**. Update it in the same branch as the work.

_Last updated: 2026-10-05_

## Current state

- **Phase 0 (requirements):** done.
- **Phase 1 (schema decisions):** decided. All ADRs are *Accepted*; the DDL hasn't been written yet.
- **No code yet.** The Nx workspace hasn't been scaffolded.
- **GitHub:** `elliemhwu/selah`, with `main` and `develop` branches.

**Next step:** merge `feat/finance-requirements` into `develop`, then write the finance schema as SQL migrations on `feat/finance-schema`.

## Phases (Finance MVP)

| # | Phase | Branch | Status |
|---|---|---|---|
| 0 | Requirements discussion → [requirements.md](finance/requirements.md) | `feat/finance-requirements` | ✅ Done |
| 0b | Project docs for multi-device development (README, CLAUDE.md, CONTRIBUTING, ADRs) | `feat/finance-requirements` | ✅ Done |
| 1 | DB schema decisions and DDL (`finance`, `core` schemas) | `feat/finance-schema` | 🟡 Decisions accepted, DDL next |
| 2 | Workspace scaffold: Nx, Angular, NestJS, libs, Docker Postgres, `.nvmrc`, `.env.example`, Swagger | `feat/workspace-setup` | ⬜ |
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

- None right now.
