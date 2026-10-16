# 0029. One app, two storage builds; the API becomes a generic row store

- Status: Accepted
- Date: 2026-10-16
- Changes: [0028](0028-local-only.md) (the API is used again, locally, as a second mode), [0026](0026-finance-core-and-device-store.md) (the API no longer runs the rules), [0017](0017-api-conventions.md) and [0024](0024-settings-resource.md) (the per-feature endpoints go). Keeps [0002](0002-openapi-from-day-one.md), [0007](0007-offline-ready-data-conventions.md) and [0015](0015-api-client-generation.md).

## Context

Phases 1 to 5 were built API-first: about twenty per-feature NestJS endpoints with 123 integration tests, and a web app that called them. Phase 6a moved every screen onto the device ([0025](0025-offline-first.md), [0026](0026-finance-core-and-device-store.md)), so since then the feature API runs, passes its tests, and is called by nothing.

On 2026-10-16 the owner set the direction for the next stages:

1. Keep building new modules first; a reachable server comes later.
2. Keep two modes working with every feature: the phone app holding its own data, and the web app on a working backend. The two don't share data.
3. The mode depends on the release build. There is no switch inside the app.
4. When a server is needed, freeze features at a steady point and port the API to ASP.NET (or publish the NestJS API as it is).

Building each feature twice, once in the app's device path and once as NestJS endpoints that the .NET port would rewrite, costs about 1.5× per feature. The .NET port can't run `finance-core` (TypeScript), so a .NET feature API would also mean a C# copy of every rule.

## Decision

**Decided by the owner (2026-10-16)**

- **Features are written once, in the app.** Screens, the feature services in `finance-api.ts` and the `finance-core` rules are the same in both modes. Only the storage under `DeviceStore` differs:
  - **Device build** (GitHub Pages, the phone): `DexieStorage`, IndexedDB.
  - **API build** (local `nx serve web`, with the API and Postgres): `ApiStorage`, which implements the same `DeviceStorage` interface (`load`, `save`, `replace`, `watch`) over HTTP.
- **The API becomes a generic row store.** It loads every row and saves a set of row changes in one transaction, for the tables the app keeps. Rows live in the existing typed tables with their constraints, not in a JSON blob. Each table has a mapper between its DTO and its SQL rows (record lines and plan items included).
- **The per-feature endpoints are replaced, not frozen**: accounts, categories, records, plan, budget transfers, reports and settings, with their integration tests. They are no longer a spec, because the .NET port ports the store. Git history keeps them.
- **Store or API:** anything the rules read lives in the store (finance data and the app settings). Anything about the user or the server (sign-in, profile, devices) will be real endpoints, when the hosted stage adds them.
- **Local `serve` stays the web app with the API**, on Postgres in Docker. The production preview and Pages are the device build.
- **Order of stages:** release and phone testing, then the generic store and the API build, then the next module, then a feature freeze and the .NET port, then the hosted service.

**Chosen during the discussion**

- **The rules run in the app in both modes; the store trusts what it receives.** For a single user this is enough. When the server goes public, the .NET stage decides which checks the server repeats.
- **Capacitor waits.** A native app wraps this same build later. Browser-only calls (the backup download, `navigator.storage.persist()`) stay behind small services, as storage already does.

## Consequences

- One code path per feature; the two modes agree by construction, and the existing web tests cover both, with a store test suite for the API side.
- A new table costs a migration and a mapper on the API, not endpoints, services and their tests.
- The NestJS store is small and meant to be thrown away at the .NET stage. The .NET port is a store, sign-in and sync, not twenty endpoints and a C# copy of `finance-core`.
- `libs/finance-core` runs only in the app. The API keeps the schema, Problem Details, OpenAPI and the DTO classes, which now describe rows, so the app's types are still generated ([0015](0015-api-client-generation.md)).
- The app loads every row at start in both modes. Years of one person's data fit; the hosted stage adds "changes since" (drafted in the closed PR #25) for more.
- Sync-ready conventions ([0007](0007-offline-ready-data-conventions.md)) matter more: client ids, `updated_at` and soft deletes are what the store and later sync run on.
