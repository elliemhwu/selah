# CLAUDE.md

Context for AI assistants (and humans) working in this repo. Keep it short and current. Put detail in `docs/`, not here.

## Project

**Selah** is a personal life management PWA with a single user. It is built module by module: **Finance** is the first, **Journal** the second ([design](docs/selah-journal-framework.md)), and **Planner** the third ([design](docs/selah-planner-framework.md), [v1 spec](docs/planner/v1-spec.md)).

- Current status and next steps: [docs/roadmap.md](docs/roadmap.md). **Read this first** and update it when a phase moves.
- Finance requirements: [docs/finance/requirements.md](docs/finance/requirements.md)
- Architecture decisions: [docs/decisions/](docs/decisions/). Follow the decisions marked _Accepted_. _Proposed_ ones still need the owner's confirmation.

## Stack

Nx monorepo:

- `apps/web`: Angular PWA
- `apps/api`: NestJS. Will be migrated to a separate .NET repo later.
- `libs/shared-types`: DTOs and enums shared by web and api
- `libs/shared-utils`: finance math as **pure functions**
- `libs/finance-core`: finance rules and reports as **pure functions**, run by the app in both builds
- `libs/journal-core`: journal rules and page selectors as **pure functions** ([ADR 0030](docs/decisions/0030-journal-module.md))
- `libs/planner-core`: planner rules and the Today and week views as **pure functions** ([ADR 0033](docs/decisions/0033-planner-module.md))
- `libs/api-client`: HTTP client for the API
- PostgreSQL, one **schema per module** (`finance`, `core`, …)

## Rules that are easy to get wrong

- **Keep `apps/api` easy to port to .NET** ([ADR 0001](docs/decisions/0001-monorepo-and-stack.md), [0002](docs/decisions/0002-openapi-from-day-one.md)):
  - Every endpoint has full OpenAPI decorators.
  - Business logic lives in services, not controllers.
  - Avoid NestJS-only magic in domain logic.
- **Regenerate after changing the contract:** run `pnpm db:codegen` after a migration and `pnpm openapi` after changing endpoints or DTOs (it also regenerates `libs/api-client`). Commit the generated files.
- **Web data lives on the device** ([ADR 0025](docs/decisions/0025-offline-first.md), [0026](docs/decisions/0026-finance-core-and-device-store.md)): screens read and write through the per-feature services in `finance/data/finance-api.ts`. Those read the `DeviceStore` (IndexedDB) and run `finance-core` rules before saving. No screen calls the API, and data shapes are the DTOs from `@selah/api-client` ([ADR 0015](docs/decisions/0015-api-client-generation.md)). In tests, seed a `MemoryStorage` with the helpers in `app/data/testing.ts`; don't stub HTTP.
- **Every UI string is translatable** ([ADR 0020](docs/decisions/0020-web-ui-foundation.md)): use `i18n` attributes in templates and `$localize` in code, each with an `@@id`. Run `pnpm nx run web:extract-i18n` after changing UI text and commit `apps/web/src/locale/messages.xlf`. Show money with the `money` pipe, never as a JS `number`.
- **The Linen ledger look** ([ADR 0021](docs/decisions/0021-linen-ledger-ui.md)): no Angular Material. Use the CDK for behaviour, the classes and CSS tokens in `apps/web/src/styles.scss` for the look, and `apps/web/src/app/ui/` for shared pieces. Never hard-code a colour or font. Forms are routes, not dialogs ([ADR 0022](docs/decisions/0022-forms-are-routes.md)): mark them `data: { form: true }` and leave with `FormNavigation`.
- **Nx loads `.env` into every task**, the Angular dev server included. Use prefixed env names (`API_PORT`, not `PORT`).
- **The API is a generic row store** ([ADR 0029](docs/decisions/0029-generic-row-store-and-two-builds.md)): `GET`/`PATCH`/`PUT /api/v1/store` load, save and replace rows in the shape the app stores them. A new table is a migration plus a row DTO and table mapper (`apps/api/src/<module>/rows/`) registered in `StoreService`; no per-feature endpoints. Errors are Problem Details ([ADR 0017](docs/decisions/0017-api-conventions.md)): services throw the errors in `apps/api/src/common/errors.ts`, never NestJS HTTP exceptions. Cover the store with `*.int-spec.ts` tests (`pnpm nx run api:integration`).
- **Finance math only in `libs/shared-utils`** ([ADR 0005](docs/decisions/0005-finance-math-in-shared-utils.md)): rounding, percentages, cadence conversion, rollover, FX.
  - Pure functions with no framework imports, each with unit tests.
  - Other code calls these functions and never reimplements the math inline.
- **Finance rules and reports only in `libs/finance-core`** ([ADR 0025](docs/decisions/0025-offline-first.md), [0026](docs/decisions/0026-finance-core-and-device-store.md)): record, account, category, plan and transfer rules; envelopes, checklist, review, movements.
  - The app runs them before every save, in both builds; the API stores what it is sent.
  - Change a rule in `finance-core`, never in the API or a web component.
- **Modules stay apart** ([ADR 0030](docs/decisions/0030-journal-module.md)): each module has its own route (`/finance`, `/journal`), its own `<module>-core` lib and its own Postgres schema. `module:*` tags and an in-app import rule stop `finance`, `journal` and `planner` importing each other; shared code goes in `shared-*` or the app's `core/`, `data/`, `ui/`. Journal bodies are never logged or copied.
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
