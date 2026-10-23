# 0032. A moment is a page of its own, and journals stick to it as memos

- Status: Accepted
- Date: 2026-10-23
- Builds on: [0030](0030-journal-module.md) (the Journal module), [0022](0022-forms-are-routes.md) (forms are routes)
- Design: [docs/selah-journal-framework.md](../selah-journal-framework.md)

## Context

In the first Journal phase only one side works. A blank diary page can be written on, and its moment memo either picks an existing moment or creates a new one. A moment, though, can only be made from a diary page, and its page in Life just lists its journals.

The owner wants the two sides to mirror each other, on the web app:

- A blank moment can be created directly in Life, as a blank journal can.
- A moment page has a **journal memo**, the way into its journals: it writes a new journal for this moment, or brings in an existing one.

The relation stays as it is: **one moment, many journals; one journal, at most one moment** (`journals.moment_id`). A many-to-many link table was considered and turned down by the owner.

## Decision

### Data

- **No schema change.** `journals.moment_id` stays the only link, so no migration is needed for SQL, the device or backups.
- **Bringing an existing journal into a moment moves it.** It sets that journal's `moment_id`. If the journal belonged to another moment, it leaves that one. This is an ordinary `prepareJournal` replace with a new `momentId`, the same rule the diary side already uses.

### A blank moment

- `/journal/life/moments/new` opens a **blank moment canvas**, like a new diary page: the date (today, editable), a title line and a summary, with no form fields around them.
- It is stored once the title has its first words, and autosaves after a short pause, when the page is left, and when the app goes to the background. Its address becomes `/journal/life/moments/:id` without leaving the page. A moment left without a title is never stored, since `prepareMoment` and the `title` CHECK require one.
- The same canvas edits a stored moment, so there is no separate edit form. **Delete moment** sits at the foot of the page and asks for a second tap, as on the diary page. The cascade is unchanged: its journals are unlinked and stay, and its comments are deleted.
- Life (`/journal/life`) lists moments newest first, with a **New moment** button.

### The journal memo on a moment

- The moment page has a **Stick a memo** bar, like the diary page, with **Journal** in it.
- **Journal** opens a form route, `/journal/life/moments/:id/journal` (ADR 0022), in the journal memo's paper colour, with two parts:
  - **Write a new one** goes to `/journal/new?moment=:id`: a blank diary page whose moment is set when its first words are stored. A page left empty stores nothing.
  - **Pick a journal** lists live journals newest first, each with its date and an excerpt. A journal that belongs to another moment shows that moment's title, and picking it says that it moves from there. Journals already on this moment are listed first and can be taken off the page (`momentId` set to null).
- Each journal on the moment is a **journal memo**: its date, the start of its body, and its own paper colour. Tapping it opens the diary page. Memos are stacked below the moment, oldest `written_at` first, with side and tilt from the hash of the journal id, as on the diary page. This is the framework's reversed presentation.
- Excerpts are drawn at render time and never stored (ADR 0030).

### Rules and selectors (`libs/journal-core`)

- No new rules. `prepareJournal` already accepts a `momentId` change, and `prepareMoment` already checks a moment.
- `momentPage` returns its journals as memos (`MomentMemo`, kind `journal`), in the same shape as `diaryPage`'s memos. A new `journalChoices(momentId, data)` gives the picker its order and each journal's current moment.

## Consequences

- No migration, no new table, nothing new for the row store or the .NET port.
- The moment page and the diary page share their autosave, memo layout and stick bar, and both are tested the same way.
- A night about two unrelated things is still two journals; that trade-off stays from the framework.
- Moving a journal is one tap. The picker names the moment it leaves, so a mis-tap is easy to see and undo.
- Comments on moments are in the schema but have no memo yet. When they get one, it joins the moment's stick bar.
