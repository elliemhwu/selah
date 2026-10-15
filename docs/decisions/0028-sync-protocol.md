# 0028. Sync: an outbox to the API's endpoints, and pulling changes since a cursor

- Status: Proposed
- Date: 2026-10-15
- Builds on: [0025](0025-offline-first.md) (offline-first, step 3 of its order of work), [0017](0017-api-conventions.md) (API conventions), [0027](0027-backups-and-hosting.md) (backups)

## Context

[0025](0025-offline-first.md) set the shape of sync: the device pushes its changes from an outbox through the existing `PUT` and `DELETE` endpoints, pulls rows changed since its last sync, the later edit wins, and a change the server refuses goes to a "needs attention" list. It left the details (cursor, timestamps, order) to this ADR.

Where the server runs (a free cloud or a home server) is still open. Nothing below depends on it: the server is the NestJS API and its Postgres, wherever they are.

## Decision

**Connecting**

- Settings has a **Sync** section that takes the server's address and an access token. Both are kept per device, in IndexedDB, and never synced or put in a backup.
- The API checks the token when `API_ACCESS_TOKEN` is set: every request except `/api/v1/health` needs `Authorization: Bearer <token>`, or it gets a 401 Problem Details. Without the variable (development, tests) the API stays open. A single user needs no accounts.
- `API_CORS_ORIGINS` lists the origins that may call the API from a browser, such as `https://elliemhwu.github.io`.
- When a device connects, everything on it goes into the outbox once, so data entered before sync existed reaches the server too.

**Push: the outbox**

- Every local save adds `{ table, id }` to an outbox **in the same IndexedDB transaction** as the rows, so a change is never saved without being queued. Saving the same row again doesn't add a second entry. Rows that come from the server are not queued.
- A push sends the row as it is now, not as it was when queued: `PUT` with the row mapped to the upsert DTO, or `DELETE` when the row is soft-deleted. An entry leaves the outbox only when the server accepts it, and only if the row hasn't changed again meanwhile.
- **Order:** creates and updates go first, by table so that what a row refers to exists before it: settings, accounts, categories (parents first), plan versions (oldest first), records, budget transfers. Deletes go after, in the opposite order. Records go in batches of 50 through `PUT /finance/records`, and one at a time when a batch is refused, to find the row at fault.
- `DELETE` of a row the server never had (404) counts as done.
- **Refusals** (400, 404, 409, 422) move the entry to **needs attention**, with the server's message. Its row keeps the device's version and isn't overwritten by pulls. Settings lists these entries with two choices: **Try again**, which puts the entry back in the outbox, and **Use the server's copy**, which drops it and pulls everything again.
- A network error, a 401, or a 5xx stops the sync. Everything stays queued for next time.

**Pull: changes since a cursor**

- `GET /api/v1/sync/changes?since=<cursor>` returns every row of every table whose `updated_at` is after the cursor, **deleted rows included** (with `deletedAt`), in the shapes the device stores, plus the next cursor. Without `since` it returns everything.
- The cursor is the server's clock when the pull started, an ISO timestamp the device keeps without reading. The server's `updated_at` is set by a trigger to the start of the writing transaction. A write that started before a pull but committed after it would be missed, so the server looks **one minute further back** than the cursor. Getting a row twice changes nothing.
- A plan version and a record are pulled whole. Saving or deleting either always updates the version or record row, so that row's `updated_at` covers its items, overrides and lines.
- A pulled row replaces the device's copy, unless the row is still in the outbox or needs attention.

**When it runs**

- A sync is a push, then a pull. It runs when the app opens, when the device comes back online, when the app comes back to the screen, a few seconds after each save, and from **Sync now** in Settings.
- One sync at a time across tabs, through the Web Locks API.

**Conflicts: the last device to sync wins**

- When two devices change the same row before syncing, the last one to push wins, because the server keeps whatever it received last. This is a little looser than "the later edit wins" in [0025](0025-offline-first.md). A true edit-time comparison would need the device's edit time stored on the server, a schema change, and for one person using two devices it is rare that both change the same row offline.

**Backups**

- Restoring a backup on a connected device clears the outbox and the cursor and queues every restored row. The restored rows then replace the server's copies, and the next pull brings back rows the backup didn't have.

## Consequences

- Sync uses the same endpoints and rules the integration tests already cover. Only `GET /sync/changes` and the token check are new on the server, and the .NET port has to provide them.
- The first sync of a device with a year of data sends a few thousand records in batches, which takes some seconds. Later syncs send only what changed.
- A refused change stays visible on the device until the user decides, instead of disappearing.
- A static token is enough for one user, behind HTTPS. If Selah ever has more users, this becomes real authentication with its own ADR.
- Restoring a backup on one device changes the data on every device, once they sync.
