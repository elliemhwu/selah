# 0017. API conventions

- Status: Accepted
- Date: 2026-10-06

## Context

Phase 4 adds the finance endpoints. They should behave the same way across resources, survive retries and later offline sync ([0007](0007-offline-ready-data-conventions.md)), and be straightforward to reproduce in .NET ([0001](0001-monorepo-and-stack.md)).

## Decision

**Routes and formats** (extending [0002](0002-openapi-from-day-one.md)):

- Routes are grouped by module: `/api/v1/finance/accounts`, `/api/v1/finance/records`, …
- JSON is camelCase. Money is a decimal string (`"1234.00"`), dates are `"YYYY-MM-DD"`, times are `"HH:MM"` ([0006](0006-money-representation.md), [0014](0014-record-dates-and-adjustments.md)).

**Writes:**

- **`PUT /{resource}/{id}` creates or replaces** (upsert). The client generates the UUID. It returns `201` when it created the row and `200` when it replaced it. Retrying a save never creates duplicates. There is no `POST` for creating rows.
- A `PUT` to a soft-deleted id returns `409`. Deleted rows are not brought back by accident.
- A record and its lines are written together, in one transaction. Saving a record replaces its whole set of lines.
- **`DELETE /{resource}/{id}` soft-deletes** (`deleted_at`) and returns `204`. Deleting an already deleted row also returns `204`. An unknown id returns `404`.

**Validation:**

- Request **shape** is validated with `class-validator` decorators on DTO classes and a global `ValidationPipe`. Unknown fields are rejected. The same classes carry the OpenAPI decorators.
- **Business rules** (whole TWD/JPY, record currency [0016](0016-record-currency-and-account-currency.md), tree cycles, …) live in services and use `libs/shared-utils`.

**Errors** use [RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457) (`application/problem+json`), which ASP.NET Core produces natively:

```json
{ "type": "about:blank", "title": "Bad Request", "status": 400, "detail": "…", "errors": { "name": ["must not be empty"] } }
```

| Status | When |
|---|---|
| 400 | The request shape is invalid. `errors` lists messages per field. |
| 404 | The resource doesn't exist. |
| 409 | Conflict: duplicate name, the row was deleted, or the row is still in use. |
| 422 | The shape is fine, but a business rule refuses it. |

**Code layout:** controllers are thin. Services hold the rules. Repositories hold the Kysely queries. Each layer maps directly to a .NET counterpart.

**Testing:**

- Service unit tests for the rules.
- HTTP integration tests (`*.int-spec.ts`, run with `pnpm nx run api:integration`) against a separate `selah_test` database in the same Docker Postgres, migrated by dbmate and emptied before each test.

## Consequences

- The web app always knows a row's id before saving, which batch entry and offline sync both need.
- The .NET API can return the same error bodies with its built-in `ProblemDetails`.
- Integration tests need Docker running. The plain `test` target stays fast and needs no database.
