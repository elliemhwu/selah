# 0025. Offline-first: the device holds all the data

- Status: Accepted. Step 3 (sync) is replaced by [0028](0028-local-only.md): local only for now.
- Date: 2026-10-14
- Extends: [0007](0007-offline-ready-data-conventions.md). Changes how the web app reaches data, set in [0015](0015-api-client-generation.md) and [0020](0020-web-ui-foundation.md).

## Context

The MVP was planned as online only: every screen reads and writes through the API, and offline sync was out of scope (requirements §6). Selah is used mostly on a phone, often without a good connection, and there is no server to reach yet. A free cloud host or a home server will be chosen later.

The groundwork is in place. The schema is ready for sync ([0007](0007-offline-ready-data-conventions.md)): client-generated ids, `updated_at` on every row, and soft deletes. The finance math is in pure functions in `libs/shared-utils` ([0005](0005-finance-math-in-shared-utils.md)). What isn't in place: the business rules and the report building (envelopes, the checklist, the monthly review, balances) run only in the API services, about 1,250 lines. The web app's only way to data is `finance-api.ts`.

On 2026-10-14 the owner chose **offline-first, with the device holding all the data**. Reading, entering and every report must work with no connection. The lighter option (show cached data, queue new entries) was turned down, because a queued entry would leave "what's left" in an envelope wrong until the next sync.

## Decision

**Decided by the owner**

- **The device holds all the data.** The web app keeps every row in the browser's IndexedDB and reads and writes there. No screen waits for the network.
- **Rules and reports run on the device.** The record, plan, transfer and category rules and the report building move out of the API services into shared pure functions, used by both the web app and the API. This applies [0005](0005-finance-math-in-shared-utils.md) to the rules as well as the math, so the device and the server give the same answers. The .NET port reimplements them, as it already must for the math.

**Confirmed by the owner (2026-10-14)**

- **The server is a sync hub and backup**, not where screens read from. The API keeps its endpoints and integration tests.
  - **Push:** the device sends its changes from an outbox, using the existing idempotent `PUT` and `DELETE` endpoints ([0017](0017-api-conventions.md)).
  - **Pull:** the device fetches rows changed since its last sync, deleted rows included.
  - **Conflicts:** when two devices change the same row, the later edit wins. That's enough for a single user.
  - **Refusals:** the server still checks every rule. A change it refuses goes to a "needs attention" list on the device instead of being dropped.
  - The details (cursor, timestamps, order) get their own ADR when sync is built.
- **Order of work:**
  1. **Device storage:** IndexedDB, the shared rules and reports, and every screen moved off the API. The app works fully on one device with no server.
  2. **Backup and hosting:** export and import of all data as a file, persistent storage (`navigator.storage.persist()`), install polish, and static hosting (for example GitHub Pages or Cloudflare Pages, both free). The app needs no server to run.
  3. **Sync:** once the free cloud or home server is chosen. _Replaced by [0028](0028-local-only.md): no sync for now; a server comes later as a hosted service with accounts._

## Consequences

- Selah works on a phone with no signal and no server, and hosting the app costs nothing until sync is needed.
- **Until sync exists, the data lives on one device only.** The browser may clear storage that isn't persistent, and a lost or reset phone loses everything since the last export. Export and persistent storage are therefore part of step 2, not optional extras.
- `finance-api.ts` becomes a local data layer with the same shape. Screens change little, but every screen's tests move from HTTP stubs to a local store.
- The settings the shell loads once ([0024](0024-settings-resource.md)) become one more local row.
- The API services shrink to checking and storing; their rules come from the shared functions. Integration tests keep proving that the server agrees with the device.
- Generated ids, soft deletes and whole-version plan saves ([0018](0018-plan-api.md)) already fit an outbox, so the schema needs no change for step 1.
