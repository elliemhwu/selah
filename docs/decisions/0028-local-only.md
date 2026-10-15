# 0028. Local only on the device; a server is a later stage

- Status: Accepted
- Date: 2026-10-15
- Changes: [0025](0025-offline-first.md) (its step 3, sync). Builds on [0027](0027-backups-and-hosting.md) (backups).

## Context

[0025](0025-offline-first.md) planned three steps: device storage, then backup and hosting, then sync with a server chosen later (a free cloud or a home server). Steps 1 and 2 are done: the app runs entirely on the phone, backs up to a file, and is published on GitHub Pages.

A sync protocol for self-hosting the NestJS API was drafted on 2026-10-15: an outbox, pulling changes since a cursor, and a static access token. The owner turned it down.

## Decision

**Decided by the owner (2026-10-15)**

- **Selah is a local-only phone app for now.** It has no sync, no server and no accounts. The data lives on the device, and backup files ([0027](0027-backups-and-hosting.md)) are the only other copy.
- **Self-hosting is not the plan.** When Selah outgrows one device, it becomes a hosted service with real accounts, a stage of its own with its own decisions (hosting, sign-in, sync, privacy), not a step of the MVP.
- Phase 6c (sync) leaves the MVP. The drafted sync work stays on the unmerged branches `feat/sync-api` and `feat/sync-device` (PRs #25 and #26, closed), for reference only.

## Consequences

- Backups matter more: they are the only protection against a lost or reset phone. The 30-day reminder and persistent storage from [0027](0027-backups-and-hosting.md) stay.
- `apps/api` and Postgres are unused by the app. They are kept, with their integration tests, because `libs/finance-core` is shared with them, so they keep proving the rules. The hosted stage will decide whether this API, or the planned .NET port, becomes the service.
- The sync-ready data conventions ([0007](0007-offline-ready-data-conventions.md)) stay: client ids, `updated_at` and soft deletes cost nothing now and keep the later stage open.
