# Architecture Decision Records

An ADR is one short file per significant decision, explaining **what** was decided and **why**. When a decision changes, add a new ADR that supersedes the old one instead of rewriting history. Update the old ADR's status to _Superseded by NNNN_.

**Statuses:**

- **Proposed:** waiting for the owner's confirmation. Don't build on it yet.
- **Accepted:** follow it.
- **Superseded:** replaced by a later ADR.

| #                                                    | Title                                                                        | Status                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------- |
| [0001](0001-monorepo-and-stack.md)                   | Nx monorepo, Angular, NestJS, PostgreSQL; API to migrate to .NET             | Accepted                                      |
| [0002](0002-openapi-from-day-one.md)                 | OpenAPI/Swagger from day one                                                 | Accepted                                      |
| [0003](0003-schema-per-module.md)                    | One Postgres schema per module                                               | Accepted                                      |
| [0004](0004-plan-record-pattern.md)                  | Plan → Record pattern                                                        | Accepted                                      |
| [0005](0005-finance-math-in-shared-utils.md)         | Finance math as pure functions in `libs/shared-utils`                        | Accepted                                      |
| [0006](0006-money-representation.md)                 | Money representation                                                         | Accepted                                      |
| [0007](0007-offline-ready-data-conventions.md)       | Offline-ready data conventions                                               | Accepted                                      |
| [0008](0008-migrations-and-data-access.md)           | SQL migrations with dbmate, queries with Kysely                              | Accepted                                      |
| [0009](0009-git-workflow.md)                         | Git workflow: `feat/*` → `develop` → `main`                                  | Accepted                                      |
| [0010](0010-tooling-pnpm-docker.md)                  | pnpm and Docker Compose for local Postgres                                   | Accepted                                      |
| [0011](0011-derive-dont-store.md)                    | Calculate balances and rollovers instead of storing them                     | Accepted                                      |
| [0012](0012-plan-versioning.md)                      | Plan versioning with stable item identity                                    | Accepted                                      |
| [0013](0013-records-with-lines.md)                   | Records with lines                                                           | Accepted (adjustment rule superseded by 0014) |
| [0014](0014-record-dates-and-adjustments.md)         | Record dates and adjustments                                                 | Accepted                                      |
| [0015](0015-api-client-generation.md)                | Generate the API client from the OpenAPI contract                            | Accepted                                      |
| [0016](0016-record-currency-and-account-currency.md) | A record's currency must fit its account                                     | Accepted                                      |
| [0017](0017-api-conventions.md)                      | API conventions: PUT upsert, soft delete, Problem Details, validation, tests | Accepted                                      |
| [0018](0018-plan-api.md)                             | The plan API saves whole versions; older versions are a read-only log        | Accepted                                      |
| [0019](0019-budget-transfers-and-reports.md)         | Budget transfers, planned amounts, envelopes across versions, reports        | Accepted                                      |
| [0020](0020-web-ui-foundation.md)                    | Web UI foundation: Angular Material, i18n, app structure                     | Accepted (components superseded by 0021)      |
| [0021](0021-linen-ledger-ui.md)                      | Linen ledger look on the Angular CDK, without Material components            | Accepted                                      |

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
