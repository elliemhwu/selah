# 0027. Backups to a file, and the app on GitHub Pages, until sync exists

- Status: Accepted
- Date: 2026-10-15
- Builds on: [0025](0025-offline-first.md) (offline-first, step 2 of its order of work)

## Context

Since [0025](0025-offline-first.md) and [0026](0026-finance-core-and-device-store.md), all data lives in the browser's IndexedDB on one device, and the app needs no server. Until sync exists, losing that browser's storage loses the data. Browsers may clear storage that isn't marked persistent when space runs low, and a reset or lost phone takes everything with it. The app also needs a public address so a phone can install it.

On 2026-10-15 the owner chose **GitHub Pages** for hosting and to **start fresh**: nothing entered into the local Postgres while testing is brought over.

## Decision

**Backups**

- Settings has a **Backup** section. "Download a backup" saves one JSON file, `selah-backup-YYYY-MM-DD.json`, holding everything on the device, deleted rows included: `{ format: "selah-backup", version: 1, exportedAt, data }`.
- **"Restore a backup…" replaces everything on the device.** Before anything changes, the screen shows the file's name and date and how many entries and accounts it holds, and asks for a second tap ("Replace my data"). A file that isn't a backup, or comes from a newer version, is refused and nothing changes.
- The date of the last download is kept per device (`localStorage`) and shown on Settings. **Home reminds the user** to back up when there is data and no backup in 30 days.

**Keeping the data**

- At start the app asks the browser to keep its storage (`navigator.storage.persist()`). Installed apps are usually granted this. Settings says whether it was granted, and that a backup is the only other copy.

**Hosting and install**

- A GitHub Action (`.github/workflows/pages.yml`) runs the unit tests and publishes the app on every push to `main`, at **https://elliemhwu.github.io/selah/**. It builds with base href `/selah/` and copies `index.html` to `404.html`, so deep links open the app.
- The app has its own icon: a terracotta fermata (the musical pause sign) over a ledger's double rule, on oatmeal paper ([0021](0021-linen-ledger-ui.md)). It is generated from `apps/web/public/icons/icon.svg` with `pnpm icons`. The manifest, the iOS meta tags and the service worker list are updated to match.

## Consequences

- The data survives a reset or lost phone only as well as the user keeps backups: the reminder helps, but nothing enforces it. There is no sync for now ([0028](0028-local-only.md)).
- Restoring replaces rather than merges, so restoring an old backup loses newer entries. The confirmation says so plainly. Merging belongs with sync.
- Only the app's code is public. Every visitor gets an empty app, and their data never leaves their device.
- The local Postgres stays a development database. The API is unused by the app until sync.
