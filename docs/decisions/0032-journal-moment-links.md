# 0032. Journals and moments link many-to-many, and Life is written into directly

- Status: Proposed
- Date: 2026-10-23
- Builds on: [0030](0030-journal-module.md) (the Journal module), [0029](0029-generic-row-store-and-two-builds.md) (row store), [0007](0007-offline-ready-data-conventions.md) (offline-ready rows), [0022](0022-forms-are-routes.md) (forms are routes)
- Design: [docs/selah-journal-framework.md](../selah-journal-framework.md)

## Context

In the first Journal phase a journal points to at most one moment (`journals.moment_id`), and a moment can only be made from a diary page's moment memo. Life is a placeholder that lists those moments.

The owner asked for three things:

1. Create a moment ("life") directly in Life, without a journal.
2. Start a journal from a moment.
3. Link the two from either side, with **many journals per moment and many moments per journal**.

That answers framework open question 1: Life is both written into directly and built from journals. A single `moment_id` column can't hold item 3. v0.2.0 is already released, so phones may hold journals with `momentId` set, and backups may contain it too.

## Decision

### Data

- **A link table, `journal.journal_moments`**, replaces `journals.moment_id`:

  ```
  journal_moments (id, journal_id, moment_id, created_at, updated_at, deleted_at)
    UNIQUE (journal_id, moment_id) WHERE deleted_at IS NULL
  ```

  It follows ADR 0007 like every other row: a client-made UUID, timestamps, and soft delete. Unlinking soft-deletes the row, and linking the same pair again brings that row back instead of adding a second one, so the partial unique index never trips. It is a plain join between two content tables, not a hub: the framework's "no hub table" rule still holds.

- **The link row is the only place a link lives.** Neither side stores a list of ids. A link row is created and removed on its own, so linking never rewrites a journal or a moment, and two links made at different times never conflict.
- **Migration**: one SQL migration creates the table, copies every non-null `moment_id` into a link row (with the journal's `created_at`), and drops the column. In the app, a Dexie `version(3)` upgrade does the same on the device, and the backup format moves to version 2. A version-1 backup still restores: its `journals[].momentId` becomes link rows on the way in.
- Comments, god notes and the future photos keep their own direct foreign keys. Only the journal–moment relation is many-to-many.

### Rules (`libs/journal-core`)

- `prepareJournal` and `JournalInput` lose `momentId`.
- New `linkJournalMoment(journalId, momentId, data, time)` and `unlinkJournalMoment(...)` return `JournalChanges` (a new `journalMoments` table in it). Both sides must be live. Linking an existing live pair changes nothing.
- **Creating with a link**: `prepareMoment` and `prepareJournal` stay single-row rules. The services save the new row and its link in one `JournalChanges`, so a moment created from a diary page, or a journal started from a moment, is linked from the moment it's stored.
- **Deleting**: deleting a journal also soft-deletes its links (plus its comments and god notes, as now). Deleting a moment soft-deletes its links and its comments. The journals stay.
- **Selectors**: `diaryPage` returns `moments: MomentRow[]`, and `momentPage` reads journals through the links. New `linkedMoments(journalId)` and `linkedJournals(momentId)` serve the pickers.

### Screens and routes

| Route                                | What it is                                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `/journal/life`                      | The Life timeline: moments newest first, each with a count of its journals, and a **New moment** button.                                      |
| `/journal/life/moments/new`          | Form route: date, title, summary. Saves and opens the moment.                                                                                 |
| `/journal/life/moments/:id`          | The moment as canvas. Actions: **Write about it**, **Link journals**, **Edit**.                                                               |
| `/journal/life/moments/:id/edit`     | Form route: edit or delete the moment.                                                                                                        |
| `/journal/life/moments/:id/journals` | Form route: the linked journals (each can be taken off), then the journal list (date + excerpt) to pick more.                                 |
| `/journal/new?moment=:id`            | A new diary page that links to that moment when its first words are stored. An empty page still stores nothing, link included.                |
| `/journal/:id/moment`                | Becomes **Moments on this page**: the linked moments (each can be taken off), pick more, or create a new one, which is linked as it is saved. |

- **Each linked moment is its own memo** on the diary page. The moment memos come first, ordered by their link's `created_at`, so linking another one adds it at the end of that group and doesn't move the rest. Comments and god notes follow by `written_at`, as now. Side and tilt still come from the hash of the memo id. For a moment memo that id is the moment's id, so a moment looks the same on every page it's stuck to.
- The moment page keeps showing its journals as a list in this phase ("Written about it", oldest first). Laying them out as memos around the moment (the framework's reversed presentation) is a later step.
- Linking is a toggle in a picker, not a form with Save: each tap saves one link, like the current moment picker.

## Consequences

- A night about two unrelated things can stay one entry. The framework's "one journal → at most one moment" trade-off is gone.
- One more table for the row store and the .NET port: a migration, a row DTO and a table mapper, registered in `StoreService`, with integration tests (round trip, revive on relink, partial unique index). `pnpm db:codegen` and `pnpm openapi` regenerate the contract.
- The device and backup migrations are the first ones that rewrite data rather than add tables. They get tests from a version-2 database and a version-1 backup.
- The pickers list every live journal or moment. Search or a date filter can wait until there are enough of them to need one.
- Journal bodies still appear only as excerpts drawn at render time, never stored on the link.
