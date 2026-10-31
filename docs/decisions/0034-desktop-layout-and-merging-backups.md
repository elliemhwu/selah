# 0034. Selah on a computer: a wide layout of the same app, and merging backups

- Status: Accepted
- Date: 2026-10-31
- Builds on: [0028](0028-local-only.md) (local only), [0027](0027-backups-and-hosting.md) (backups), [0021](0021-linen-ledger-ui.md) (Linen ledger), [0022](0022-forms-are-routes.md) (forms are routes), [0030](0030-journal-module.md) (modules)

## Context

The owner wants to plan Finance, Planner and Journal on a Mac or PC as well as the phone. There is still no server ([0028](0028-local-only.md)), so each device keeps its own data in its own browser. The screens were designed for a phone: a bottom navigation per module and one narrow column.

## Decision

**Decided by the owner (2026-10-31)**

- **The computer version is the same PWA with a wide layout**, not a native app. It installs from Safari (Add to Dock) or Chrome and works offline like the phone. A Tauri or Electron wrapper would add signing and updates with no data benefit while there is no server.
- **Data moves between devices by merging backup files.** _Merge a backup_ sits next to _Restore_: export on one device, move the file (AirDrop, iCloud Drive), merge on the other. Restore still replaces everything.

**How the wide layout works**

- From **1024px** wide, a sidebar on the left replaces the bottom navigations: Selah's modules, and the current module's sections under it. Module shells hide their bottom navigation at that width. The sidebar lives in the app shell (`app/ui/`), not in a module, so modules stay apart.
- Pages get more room where it helps and stay a readable column where it doesn't. Planner's Today shows the week beside the day; forms stay a centred column, with the sidebar still visible.
- Below 1024px nothing changes.

**How merging works**

- Rows are matched by id ([0007](0007-offline-ready-data-conventions.md)). For each id, the row with the later `updatedAt` wins; a tie keeps this device's row. A soft delete is a row like any other, so deletions carry over. Rows only one side has are kept. The settings row merges the same way.
- The merge is calculated in `data/backup.ts` as a pure function, shown as a summary (new and newer rows), and saved in one save after the user confirms. Nothing is wiped.

## Consequences

- Each device still has its own copy; merging is manual and only as fresh as the last file. The hosted stage ([0028](0028-local-only.md)) remains the real fix.
- Merging is row by row, so a rule that spans rows can end up broken when both devices changed the same thing apart: for example, a task marked done on each device leaves two done records, or two categories with the same name. Views stay usable (they read the first), and the user can fix it by hand. The device build doesn't enforce cross-row constraints; the API build would refuse such a merge with a 409.
- Merging tells the user to back up first, like restoring does.
