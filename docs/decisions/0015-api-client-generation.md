# 0015. Generate the API client from the OpenAPI contract

- Status: Accepted
- Date: 2026-10-06

## Context

[0002](0002-openapi-from-day-one.md) left one question for the workspace scaffold: should `libs/api-client` be hand-written or generated from the spec? Generation was preferred. After the .NET migration, the client must keep working unchanged against the .NET API's OpenAPI document ([0001](0001-monorepo-and-stack.md)).

The scaffold already commits the contract as `apps/api/openapi.json`, regenerated with `pnpm openapi`.

## Decision

Keep the MVP simple, and leave room to grow:

- **Types:** [`openapi-typescript`](https://openapi-ts.dev) generates `paths` and `components` types from `apps/api/openapi.json` into `libs/api-client`. The generated file is committed. `libs/api-client` contains types only.
- **Calls:** plain Angular `HttpClient` (and `httpResource`), typed with the generated DTOs: `http.get<ApiSchemas['AccountDto']>(...)`.
- **Where calls live:** in small per-feature services in `apps/web` (e.g. `AccountsApi`), not spread through components. A later change of approach then touches only those services.
- **One command** keeps the types in sync: `pnpm openapi` exports the contract from the API and regenerates the types.
- The DTO types used by the web app come from `@selah/api-client`, not from `libs/shared-types`. `shared-types` keeps only what the spec can't express, such as the currency list and section order.

## Consequences

- A change to a DTO becomes a reviewable diff in `openapi.json` and in the generated types, and TypeScript flags code that uses a changed DTO.
- **URLs are plain strings.** A wrong URL, or the wrong DTO type for an endpoint, is not caught at compile time; tests and the dev server catch it. That is acceptable while the API is small.
- Angular tooling works as usual: interceptors, `HttpTestingController`, `httpResource`.
- When the API moves to .NET, regenerating the types from the .NET spec is the only client-side change.

## To compare when the frontend grows

When the number of endpoints and call sites makes untyped URLs a real cost, compare these against plain `HttpClient`:

- **A typed wrapper over `HttpClient`:** about 60 lines of type helpers that check paths, path parameters, bodies and responses against `paths`, while keeping `HttpClient`, interceptors and `httpResource`.
- **[`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/):** fully typed calls with almost no code of our own, but it bypasses `HttpClient` and its tooling.
- **`openapi-generator` (typescript-angular):** generated Angular services on `HttpClient`. Most "done for you", but the output is large, needs Java to run, and ties the lib to Angular.

All three build on the same generated types, so moving to any of them means rewriting the per-feature services, not the components.

A hand-written client was rejected: it drifts from the contract, and the .NET migration would have to be checked by hand.
