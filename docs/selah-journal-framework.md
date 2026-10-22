# Selah Journal — Module Framework

_Snapshot: 2026-10-20 · Status: concept, first mockup done_

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
  - **Moment**: the linked life event, showing a brief summary or photo; tapping opens it in Life.
- **Review is an action, not a mode.** Reviewing means picking a memo type and sticking it on the page.

### Life

- Main canvas: what actually happened. A delightful record of daily life, life events and precious memories.
- Gathers people, places and so on. Approach not decided yet (AI-assisted extraction is a candidate, see Open questions).
- Reversed presentation: the moment is the canvas; journals, photos and comments become memos.

## Data model

```
moments    (id, date, title, summary)

journals   (id, moment_id NULL, written_at, date_precision, body)

photos     (id, moment_id NULL, journal_id NULL, taken_at, url)

comments   (id, journal_id NULL, moment_id NULL, written_at, body)
             CHECK exactly one of journal_id / moment_id is set

god_notes  (id, journal_id, written_at, body, verse_ref)
```

Decisions behind it:

- **No hub table.** Content tables link to each other directly.
- **Many journals → one moment.** A big event can collect many entries over weeks. Trade-off: one journal links to at most one moment; a night about two unrelated things becomes two entries.
- **`journals.moment_id` is nullable.** Many emotional nights have no clear event; a moment can be linked later during review, or never.
- **Photos attach to either.** Scans of handwritten pages belong to a journal; photos of memories belong to a moment.
- **One `comments` table** with two nullable foreign keys, so "everything I wrote back to myself in year X" is one query across both.
- **`date_precision`** (`day | month | season | year`) lets imported journals with guessed dates sit honestly on the timeline.
- **Naming:** `journals` (not letters, pages, thoughts) and `comments` (short, margin-note feel). UI text can still read "Replied by Ellie from…".

## Memo layout

- No placement table. Memo position is computed in code (e.g. stacked at the bottom, alternating left/right).
- Side and tilt are derived deterministically from the memo id (e.g. a hash), so memos look random but never jump between renders.
- Memos ordered by `written_at`, so replies read as a timeline down the page.

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

## Open questions

1. **Life entry flow:** is Life mainly written into directly on good days, or built from journals and imports (more of a gallery/timeline)? Decides what to build first.
2. **People and places:** how to model them (`people` with aliases for 媽 / Mom / nicknames; fuzzy places), and how much AI extraction does (suggest-and-confirm is the candidate).
3. **"What I actually felt"** appears as a memo in the mockup but isn't in the schema yet: own table, or part of a comment?
4. **Multiple writing bursts per page:** is one journal per sitting enough, or should a later burst attach to the same page?
5. **God notes on moments:** keep journal-only, or allow on moments with the same pattern as comments?
6. **Navigation:** the journal must be reachable in one tap at 1 a.m.; how Selah's home screen provides that.
7. **Memo types for future users:** keep God note fixed, or make memo types configurable if Selah later serves others?

## Artifacts

- Dear Diary page mockup (phone, Design canvas): "Dear Diary Mockup".
