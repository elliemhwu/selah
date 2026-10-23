# Selah Journal — Module Framework

_Snapshot: 2026-10-23 · Status: first phase built (Dear Diary, journal list, Life placeholder); Life and many-to-many links designed ([ADR 0032](decisions/0032-journal-moment-links.md), proposed)_

## Purpose

A place to organize thoughts and feelings over time and to practice answering default self-judging thoughts with God's word. Raw emotional writing stays honest and unfiltered; understanding comes later, through review. Over time the module should show the development of both the emotional and the spiritual journey, and gather the scattered old journals (Notion, Notes apps, handwritten notebooks, memo papers) into one place.

## Core principle

**One journey, different views.** All content is linked data. A view decides which content type is the main canvas and renders the others as memos around it. Adding a view should never require a schema change.

## Views

### Dear Diary

- Main canvas: the raw journal writing ("Dear Diary"). No fields or structure while writing.
- Everything else appears as sticky memos on the page, each type its own paper color:
  - **Comment**: a short reply from a later Ellie ("Replied by Ellie from 2026.10").
  - **God note**: what God would say, written in a mentoring voice, with an optional verse reference.
  - **Moment**: a linked life event, showing a brief summary or photo; tapping opens it in Life. A page can hold several.
- **Review is an action, not a mode.** Reviewing means picking a memo type and sticking it on the page.

### Life

- Main canvas: what actually happened. A delightful record of daily life, life events and precious memories.
- Written into directly (a new moment needs no journal) and built from journals: a moment can start a new journal, and journals and moments link from either side ([ADR 0032](decisions/0032-journal-moment-links.md)).
- Gathers people, places and so on. Approach not decided yet (AI-assisted extraction is a candidate, see Open questions).
- Reversed presentation: the moment is the canvas; journals, photos and comments become memos.

## Data model

```
moments    (id, date, title, summary)

journals   (id, written_at, date_precision, body)

journal_moments (id, journal_id, moment_id)
             UNIQUE (journal_id, moment_id) among live rows

photos     (id, moment_id NULL, journal_id NULL, taken_at, url)

comments   (id, journal_id NULL, moment_id NULL, written_at, body)
             CHECK exactly one of journal_id / moment_id is set

god_notes  (id, journal_id, written_at, body, verse_ref)
```

Decisions behind it:

- **No hub table.** Content tables link to each other directly; `journal_moments` is a plain join between two of them.
- **Journals and moments are many-to-many** ([ADR 0032](decisions/0032-journal-moment-links.md)). A big event can collect many entries over weeks, and a night about two things can link both. Unlinking soft-deletes the link row, and linking the pair again revives it.
- **Links are optional.** Many emotional nights have no clear event, and many moments are never written about; a link can be added later during review, or never.
- **Photos attach to either.** Scans of handwritten pages belong to a journal; photos of memories belong to a moment.
- **One `comments` table** with two nullable foreign keys, so "everything I wrote back to myself in year X" is one query across both.
- **`date_precision`** (`day | month | season | year`) lets imported journals with guessed dates sit honestly on the timeline.
- **Naming:** `journals` (not letters, pages, thoughts) and `comments` (short, margin-note feel). UI text can still read "Replied by Ellie from…".

## Memo layout

- No placement table. Memos are stacked below the writing, each on the left or the right.
- Side, tilt (0.6° to 3° either way) and a small nudge come from a hash (FNV-1a) of the memo id alone, not from its place in the stack, so memos look scattered by hand, never jump between renders, and adding or linking one never moves the others. A run of memos on the same side is fine. A test pins the hash, since changing it would move every memo already on a page.
- The linked moments come first, as the page's context, in the order they were linked; then comments and god notes by `written_at`, so replies read as a timeline down the page. Comments on a moment show in Life, not on the diary page.

## Architecture

- Second module of the `selah` Nx monorepo (alongside Finance), not a separate repo.
- Laid out like Finance ([ADR 0030](decisions/0030-journal-module.md)): screens in `apps/web/src/app/journal/`, rules and selectors as pure functions in `libs/journal-core`.
- No per-feature endpoints: the journal tables are rows in the API's generic row store ([ADR 0029](decisions/0029-generic-row-store-and-two-builds.md)). The app holds every row, so the Dear Diary page is built in one step from memory, in both builds and offline.
- Nx `enforce-module-boundaries` with a module tag axis (`module:journal`, `module:finance`, `module:shared`) keeps the modules independent; `scope:*` already means web, api or shared. Inside the app, an import rule keeps `finance/` and `journal/` apart.
- Own Postgres schema: `journal.*`. No owner columns while Selah has one user.
- Photos wait until Selah has file storage.
- Optional later: `apps/journal-web` as a standalone PWA on the same libs.

### Routing (decided 2026-10-21)

- Modules are separated by route for now: Finance at `/finance`, Journal at `/journal`, and a small home page at `/` with an entry to each. On GitHub Pages they sit under `/selah/`, which comes from the base href, not from the route paths ([ADR 0030](decisions/0030-journal-module.md)).
- Each module lazy-loaded (`loadChildren`), so journal code ships as its own chunk.
- The journal route is the natural place for a lock guard (`canMatch`) once the PIN/biometric lock exists.
- One-tap access: PWA manifest `shortcuts` can point straight to a new journal entry.

## Privacy

Journal content is the most sensitive data in Selah.

- Encryption at rest for journal bodies at minimum; consider client-side encryption.
- Consider a separate lock (PIN or biometric) for opening the module.
- Any AI analysis of journal text is opt-in; decide whether it runs on-device or asks before each analysis.

## Importing old journals

- Photo upload of handwritten pages with OCR (mixed Chinese/English handwriting).
- Imported entries are not forced into the memo structure; they come in as journals with a photo, text and an estimated date (`date_precision`).
- People, places and moments can be added later, while rereading.

## Later

- Tracking: menstrual cycle, bed time, wake time, exercise, water and other habits, shown alongside emotional entries to reveal patterns. Likely shared with Goal Tracker / Food Planner after integration.
- Cross-module links (e.g. a Calendar record becoming or linking to a moment) once the module is in place.

## Decisions in the first phase (2026-10-21)

- **Writing:** a new page is an empty lined sheet. It is stored on its first words, autosaves after a short pause (and when the page is left or the app goes to the background), and its address becomes `/journal/:id` without leaving the page. A page left empty is never stored. The body is kept exactly as written.
- **Memos are form routes** (ADR 0022) in their own paper colour: `/journal/:id/comment`, `/journal/:id/god-note`, `/journal/:id/moment` (pick moments, create one, or take one off the page; since ADR 0032 a page holds several). Editing a memo keeps its `written_at`, so it doesn't move down the page.
- **Deleting** a journal also deletes its comments and god notes; deleting a moment unlinks its journals and deletes its comments. All are soft deletes. Since ADR 0032, unlinking means soft-deleting the link rows.
- **Label:** a comment reads "Replied by Ellie · YYYY.MM" from its `written_at`. The name is part of the translatable text for now.
- **Photos** wait until Selah has file storage.

## Life and links (designed 2026-10-23, [ADR 0032](decisions/0032-journal-moment-links.md), proposed)

- `/journal/life` is a timeline of moments with **New moment** (`/journal/life/moments/new`). A moment page offers **Write about it** (`/journal/new?moment=:id`, linked when its first words are stored), **Link journals** (`/journal/life/moments/:id/journals`) and **Edit**.
- Both pickers save one link per tap and list what's linked first, each with a way to take it off.
- The moment page lists its journals for now; laying them out as memos around the moment comes later.

## Open questions

1. ~~**Life entry flow:**~~ Both: written into directly and built from journals ([ADR 0032](decisions/0032-journal-moment-links.md)). Imports come later.
2. **People and places:** how to model them (`people` with aliases for 媽 / Mom / nicknames; fuzzy places), and how much AI extraction does (suggest-and-confirm is the candidate).
3. **"What I actually felt"** appears as a memo in the mockup but isn't in the schema yet: own table, or part of a comment?
4. **Multiple writing bursts per page:** is one journal per sitting enough, or should a later burst attach to the same page?
5. **God notes on moments:** keep journal-only, or allow on moments with the same pattern as comments?
6. **Navigation:** the journal must be reachable in one tap at 1 a.m.; how Selah's home screen provides that.
7. **Memo types for future users:** keep God note fixed, or make memo types configurable if Selah later serves others?

## Artifacts

- Dear Diary page mockup (phone, Design canvas): "Dear Diary Mockup".
