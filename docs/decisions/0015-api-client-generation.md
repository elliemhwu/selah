# 0015. Generate the API client from the OpenAPI contract

- Status: **Proposed**
- Date: 2026-10-05

## Context
[0002](0002-openapi-from-day-one.md) left one question for the workspace scaffold: should `libs/api-client` be hand-written or generated from the spec? Generation was preferred. After the .NET migration, the client must keep working unchanged against the .NET API's OpenAPI document ([0001](0001-monorepo-and-stack.md)).

The scaffold already commits the contract as `apps/api/openapi.json`, regenerated with `pnpm openapi`.

## Decision
- **Types:** [`openapi-typescript`](https://openapi-ts.dev) generates `paths` and `components` types from `apps/api/openapi.json` into `libs/api-client`. The generated file is committed.
- **Runtime client:** [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/), a small typed wrapper around `fetch`. `libs/api-client` exports a `createApiClient(baseUrl)` function and stays framework-free.
- **Angular** wraps the client in an injectable service in `apps/web`. That service is the only place the web app calls the API.
- The DTO types used by the web app come from the generated client, not from `libs/shared-types`. `shared-types` keeps only what the spec can't express, such as the currency list and section order.

## Consequences
- A change to an endpoint becomes a reviewable diff in `openapi.json` and in the generated types.
- When the API moves to .NET, regenerating from the .NET spec is the only client-side change.
- Calls don't go through Angular's `HttpClient`, so its interceptors and `HttpTestingController` aren't available. Tests mock the client service instead.

## Alternatives considered
- **A hand-written client:** drifts from the contract, and the .NET migration would need to be checked by hand.
- **`openapi-generator` (typescript-angular):** generates Angular services on `HttpClient`, but the output is large, Java-based to run, and ties the lib to Angular.
- **Types only, called through `HttpClient`:** keeps Angular tooling, but every call writes its URL and types by hand.
