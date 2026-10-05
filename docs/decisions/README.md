# Architecture Decision Records

An ADR is one short file per significant decision, explaining **what** was decided and **why**. When a decision changes, add a new ADR that supersedes the old one instead of rewriting history. Update the old ADR's status to *Superseded by NNNN*.

**Statuses:**

- **Proposed:** waiting for the owner's confirmation. Don't build on it yet.
- **Accepted:** follow it.
- **Superseded:** replaced by a later ADR.

| # | Title | Status |
|---|---|---|
| [0001](0001-monorepo-and-stack.md) | Nx monorepo, Angular, NestJS, PostgreSQL; API to migrate to .NET | Accepted |
| [0002](0002-openapi-from-day-one.md) | OpenAPI/Swagger from day one | Accepted |
| [0003](0003-schema-per-module.md) | One Postgres schema per module | Accepted |
| [0004](0004-plan-record-pattern.md) | Plan → Record pattern | Accepted |
| [0005](0005-finance-math-in-shared-utils.md) | Finance math as pure functions in `libs/shared-utils` | Accepted |
| [0006](0006-money-representation.md) | Money representation | Proposed |
| [0007](0007-offline-ready-data-conventions.md) | Offline-ready data conventions | Accepted |
| [0008](0008-migrations-and-data-access.md) | SQL migrations with dbmate, queries with Kysely | Proposed |
| [0009](0009-git-workflow.md) | Git workflow: `feat/*` → `develop` → `main` | Accepted |
| [0010](0010-tooling-pnpm-docker.md) | pnpm and Docker Compose for local Postgres | Proposed |
| [0011](0011-derive-dont-store.md) | Calculate balances and rollovers instead of storing them | Accepted |
| [0012](0012-plan-versioning.md) | Plan versioning with stable item identity | Proposed |
| [0013](0013-records-with-lines.md) | Records with lines | Accepted |

## Template

```markdown
# NNNN. Title

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD

## Context
Why a decision is needed.

## Decision
What we do.

## Consequences
Trade-offs and what follows from this decision.
```
