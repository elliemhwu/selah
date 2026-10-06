# CLAUDE.md

Context for AI assistants (and humans) working in this repo. Keep it short and current. Put detail in `docs/`, not here.

## Project

**Selah** is a personal life management PWA with a single user. It is built module by module, and **Finance** is the first module.

- Current status and next steps: [docs/roadmap.md](docs/roadmap.md). **Read this first** and update it when a phase moves.
- Finance requirements: [docs/finance/requirements.md](docs/finance/requirements.md)
- Architecture decisions: [docs/decisions/](docs/decisions/). Follow the decisions marked _Accepted_. _Proposed_ ones still need the owner's confirmation.

## Stack

Nx monorepo:

- `apps/web`: Angular PWA
- `apps/api`: NestJS. Will be migrated to a separate .NET repo later.
- `libs/shared-types`: DTOs and enums shared by web and api
- `libs/shared-utils`: finance math as **pure functions**
- `libs/api-client`: HTTP client for the API
- PostgreSQL, one **schema per module** (`finance`, `core`, …)

## Rules that are easy to get wrong

- **Keep `apps/api` easy to port to .NET** ([ADR 0001](docs/decisions/0001-monorepo-and-stack.md), [0002](docs/decisions/0002-openapi-from-day-one.md)):
  - Every endpoint has full OpenAPI decorators.
  - Business logic lives in services, not controllers.
  - Avoid NestJS-only magic in domain logic.
- **Regenerate after changing the contract:** run `pnpm db:codegen` after a migration and `pnpm openapi` after changing endpoints or DTOs (it also regenerates `libs/api-client`). Commit the generated files.
- **Web → API calls** ([ADR 0015](docs/decisions/0015-api-client-generation.md)): plain `HttpClient` / `httpResource`, typed with DTOs from `@selah/api-client` (never hand-written or from `shared-types`). Put calls in per-feature services, not components.
- **Nx loads `.env` into every task**, the Angular dev server included. Use prefixed env names (`API_PORT`, not `PORT`).
- **API conventions** ([ADR 0017](docs/decisions/0017-api-conventions.md)): `PUT /{id}` upserts with client ids, `DELETE` soft-deletes, errors are Problem Details. Services throw the errors in `apps/api/src/common/errors.ts`, never NestJS HTTP exceptions. Cover endpoints with `*.int-spec.ts` tests (`pnpm nx run api:integration`).
- **Finance math only in `libs/shared-utils`** ([ADR 0005](docs/decisions/0005-finance-math-in-shared-utils.md)): rounding, percentages, cadence conversion, rollover, FX.
  - Pure functions with no framework imports, each with unit tests.
  - Other code calls these functions and never reimplements the math inline.
- **Money is never a JS `number` in transit** ([ADR 0006](docs/decisions/0006-money-representation.md)): `NUMERIC` in the DB, decimal strings over the API, integer cents in calculations. TWD/JPY are whole units; round half away from zero.
- **Data is ready for offline sync** ([ADR 0007](docs/decisions/0007-offline-ready-data-conventions.md)):
  - UUID primary keys that the client can generate
  - `created_at` / `updated_at` on every row
  - Soft delete via `deleted_at`
- **Calculate, don't store** ([ADR 0011](docs/decisions/0011-derive-dont-store.md)): balances, rollover/resets and checklist status are computed from records and never cached in tables.
- **Plan → Record** ([ADR 0004](docs/decisions/0004-plan-record-pattern.md)): plans and records are stored independently. Record lines point to the stable `budget_items.id`.

## Git workflow

See [CONTRIBUTING.md](CONTRIBUTING.md).

- `main` is release-ready, and `develop` is where finished work is integrated.
- Every change goes on `feat/<name>` (or `fix/`, `docs/`, `chore/`), branched from `develop`.
- Branches merge into `develop` through a GitHub PR. `develop` merges into `main` through a PR.
- Commit messages use Conventional Commits: `feat(finance): …`, `docs: …`, `chore: …`.
- Never commit directly to `main` or `develop`, and never force-push them.
- Ask before pushing, opening PRs, or anything else that is visible outside this machine.

## Working style

- Talk through key decisions before generating large amounts of code. Record decisions as ADRs.
- Update `docs/roadmap.md` (and the requirements, if they change) in the same branch as the work.
- Never commit `.env` files or secrets. Keep `.env.example` up to date.
