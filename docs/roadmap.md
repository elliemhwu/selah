# Roadmap & Status

The single source of truth for **where development stands**. Update it in the same branch as the work.

_Last updated: 2026-10-05_

## Current state

- **Phase 0 (requirements):** done.
- **Phase 1 (schema decisions):** in discussion.
- **No code yet.** The Nx workspace hasn't been scaffolded.
- **No GitHub remote yet.** The owner will create an empty `selah` repo, or install the `gh` CLI.

**Next step:** the owner confirms the *Proposed* ADRs ([0006](decisions/0006-money-representation.md), [0008](decisions/0008-migrations-and-data-access.md), [0010](decisions/0010-tooling-pnpm-docker.md), [0012](decisions/0012-plan-versioning.md)). Then write the finance schema as SQL migrations.

## Phases (Finance MVP)

| # | Phase | Branch | Status |
|---|---|---|---|
| 0 | Requirements discussion → [requirements.md](finance/requirements.md) | `feat/finance-requirements` | ✅ Done |
| 0b | Project docs for multi-device development (README, CLAUDE.md, CONTRIBUTING, ADRs) | `feat/finance-requirements` | ✅ Done |
| 1 | DB schema decisions and DDL (`finance`, `core` schemas) | `feat/finance-schema` | 🟡 Decisions proposed |
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

- GitHub remote: will the owner create the repo, or should it be created through the `gh` CLI?
