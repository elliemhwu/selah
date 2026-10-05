# 0001. Nx monorepo, Angular, NestJS, PostgreSQL; API to migrate to .NET

- Status: Accepted
- Date: 2026-10-05

## Context
Selah is a personal PWA that will grow module by module (Finance first). The owner wants one repo for the frontend and shared code. Long term, the owner wants the backend in .NET.

## Decision
- An Nx monorepo named `selah`, containing:
  - `apps/web`: Angular PWA
  - `apps/api`: NestJS
  - `libs/shared-types`: DTOs and enums
  - `libs/shared-utils`: finance math
  - `libs/api-client`: HTTP client
- PostgreSQL as the database.
- `apps/api` will later move to a **separate .NET Core repo**. The Angular monorepo stays as `selah`.

## Consequences
- The API must be easy to port:
  - The OpenAPI contract is the boundary ([0002](0002-openapi-from-day-one.md)).
  - The schema is owned by plain SQL ([0008](0008-migrations-and-data-access.md)).
  - Math is isolated in pure functions ([0005](0005-finance-math-in-shared-utils.md)).
- After the migration, `libs/shared-types` and `libs/api-client` should be generated from the .NET OpenAPI spec instead of being shared with NestJS.
