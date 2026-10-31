# Selah Planner — Module Framework

_Snapshot: 2026-10-31 · Status: designed, not built. v1 build spec: [planner/v1-spec.md](planner/v1-spec.md). Structure: [ADR 0033](decisions/0033-planner-module.md)_

> Living doc.
> Decided = agreed in the interview. Leaning = proposed, not yet confirmed. Open = still being explored. Parked = deliberately postponed.

---

## 1. Principles

### Priority order (decided)

1. **Simple on the surface.** Easy to use and an exact fit for daily use. The standard behavior is plain and predictable.
2. **Rich underneath.** Plenty of features, kept out of the way: swipe, long-press, detail sheet, settings.

> Like classic macOS / iOS: the default path just works, and the depth is there when you look for it.

**Design rule:** every feature has a **default path** (no setup, one tap or none) and optional **depth**. If a feature can't be given a no-setup default, it doesn't go on the surface.

### Other principles

- **Plan → Record.** Everything is a plan until it happens and a record once it does. Records are immutable history.
- **Recording must be close to zero effort.** If a plan exists, confirming it is one tap, or no tap at all.
- **Rhythm and rest over constant productivity.** The daily view should never feel heavier than the day really is.
- **Mindful, not automatic, for choices.** Selah never reschedules behind my back; picking a task back up is a small, deliberate choice.
- **Track silently, analyze later.** History worth reflecting on (slips, real work days) is captured with zero extra setup. Insights come later.
- **Simpler than Notion, or not worth it.** Notion felt stuck but was simple. Any feature needing more setup than Notion fails.
- **My own use case first.** Design for future users (18–25) later.

### The repeating pattern: Template → Plan → Record

| Template (reusable, no dates)     | Plan (dated, editable)               | Record (immutable)         |
| --------------------------------- | ------------------------------------ | -------------------------- |
| Weekly agenda (華冠 Mon 13–17…)   | Weekly events                        | Event happened / cancelled |
| Task list of a book / problem set | Queue items pulled into a time block | Item done in that block    |
| _(parked)_ Routine / habit        | Habit occurrence                     | Done / missed              |

---

## 2. Scope

| Version                | Contents                                                                                                                                                                        | Status                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **v1: replace Notion** | Areas / Groups / Projects; tasks with Due, Plan-to-do, automatic Done; one-tap done; queues; "Study now"; Today view; Slipped actions; worked-on / started; Prioritized (today) | **Decided.** Enough to switch. |
| **v2: time**           | Time blocks planned ahead; agenda → weekly events with auto-recording; appointments; detailed timing (Notion pain point)                                                        | Ideal, _if_ as easy as Notion  |
| **Later**              | Availability & context filters; Routines/habits; pace prediction; insights from plan history; Reading/Study module                                                              | Parked                         |

### What "stuck" in Notion meant (v1 must fix all of these)

1. Plans go stale: Monday's task still says Monday on Thursday.
2. Records fall out of date: not updated → board stops being trusted.
3. Rescheduling by hand: fixing 20 dates when behind feels pointless.
4. Detailed timing is hard to set (→ v2).

---

## 3. Decided

### Hierarchy

```
Area  ──►  Group (optional)  ──►  Project  ──►  Task
life domain   job / church /        container      unit of
(工作, 學習, 信仰)  seminary…           of tasks       work
```

- **Area** = life domain. A Group is _not_ a smaller Area.
- **Group** = optional layer for things like a job. Any nesting happens here. Projects never nest.
- **Project** = a container of tasks. Flat. Can sit directly under an Area (LeetCode, System Design book).
- Loose group tasks go in a catch-all project (e.g. "華冠 · General").
- **Stage is dropped.**

### Task fields

- **Due** (external), **Plan to do**, **Done** (from records, never typed by hand).
- **Plan to do can be rough:** a **day**, a **week**, or a **month** (e.g. "Nov 2026" → "week of Nov 9" → "Wed Nov 11"). For work in progress it means "the next time I'll touch it".
- **Prioritized** = "do this first today". **Temporary.** It's the same thing as focus.
- **Started** = a fact: some work has been recorded, not finished.
- **No Type.** **No Future status** (see Leaning L4).
- Class work with due dates = **plain dated tasks**, no queue. A task may cover several chapters.

### Statuses come from records, not a dropdown

| Notion status | Selah                                                             |
| ------------- | ----------------------------------------------------------------- |
| Not started   | no records                                                        |
| In progress   | **started** (has a worked-on record) and/or **Prioritized** today |
| Done          | Done record                                                       |
| Cancelled     | _cancelled or abandoned_ record (via **let go**)                  |
| Future        | not a status → _later_ (L4)                                       |

### Today view

1. **Today**: Plan-to-do = today (main list; Prioritized first)
2. **Overdue**: Due passed
3. **Slipped**: Plan-to-do passed, Due not
4. **Next**: due soon, not planned
5. When all done: **suggested next queue items** (or shown with related tasks)

### Planning (how tasks get their days)

- **Default habit: a weekly sit-down**, Monday morning or Saturday night, like a **bullet journal migration**.
  - Starting list: (1) carried over from last week, (2) due soon with no plan, (3) planned for this month but no week yet.
  - Each item → a **day**, **this week**, or **later**.
- **Backup: the daily pool.** If Today is empty, pick from this week's undated tasks first, then this month's.

### Slipped tasks

- **Same rule at every size.** A day task slips the next day, a week task when the week ends, a month task when the month ends. All show in the daily Slipped section.
- **Stay in Slipped until I act.** No auto-move.
- One-tap actions: **today** · **pick a day** · **unplan** · **done on…** (quick picks: yesterday / the planned day) · **let go** (= cancelled or abandoned)

### Cross-day work

- Tap **worked on it** → small progress record, task marked started → asks **"continue when?"**: tomorrow (default) / pick a day / later.
- If you skip a day, it goes through Slipped like everything else.
- Final **done** = the last record. The task's history = its records (worked Tue → done Thu).

### Plan history

- **Plan date changes are logged automatically** (Tue → Wed → Thu), with no extra steps. They're kept for future reflection ("this kind of task always takes me 2 extra days"), not shown in v1.

### Queue

- A **Queue** = an ordered list of tasks in a project, done in order (LeetCode, System Design chapters).
- **Queue items never store a date.** A time block asks for "the next item", and pairing is computed each time you look. Miss a block → nothing shifts. Finish early → the next block already shows the next item.
- Second pass through a book = copy the task list. Linking passes → future **Reading / Study module**.

### Time blocks

- A **time block** holds **queues and/or normal tasks**, from different projects.
- Created **ahead of time** (v2) or **on the spot** ("Study now → LeetCode", v1).
- **Flexible amount**: shows the next item of each queue; tick it and the following item appears; halfway → don't tick, it stays at the front.
- **No weekly slot pattern.**

### Weekly agenda → events (v2)

- **Agenda** = template of recurring committed time. It **fills each week with events**; each event can be edited or cancelled on its own.

### Daily view

- Events, time blocks and (later) routines in **one view**, **marked differently** (firm vs soft).

---

## 4. Leaning (proposed, not yet confirmed)

| #   | Proposal                                                                                                                                                                                 | Why                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| L1  | Agenda events are **planned automatically** when generated and **recorded automatically** once their time passes, unless cancelled.                                                      | Firm blocks rarely change. Log only the exceptions.         |
| L2  | Agenda events, appointments and study blocks are **one concept** (time block) differing by _repeats?_ / _firm or soft?_ / _holds work?_. Blocks live in Planner; Calendar is a **view**. | Blocks hold tasks, so they belong with tasks.               |
| L3  | Firm blocks record automatically; soft blocks and tasks record with one tap.                                                                                                             | The more reliable the plan, the less confirmation it needs. |
| L4  | **"Later"** replaces Future: a flavor of _unplan_. The task leaves Next and Slipped and waits quietly in its project.                                                                    | Future is rare; no new status needed.                       |
| L5  | **Prioritized clears overnight.** Choose again each morning.                                                                                                                             | It means "first today", not a lasting property.             |
| L6  | "Continue when?" defaults to tomorrow; dismissing it = tomorrow.                                                                                                                         | Keeps it one tap so it doesn't become annoying.             |

---

## 5. Open

| #   | Question                                                                                   | Current state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | **Name for Group.** "Role" fits but feels overwhelming.                                    | `group` in code. Ideas: Space, Circle (圈子).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| O2  | **Does a Group end?**                                                                      | Unanswered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| O3  | **Do firm blocks hold work?** (華冠 Mon 13–17 showing Project A tasks; wedding tasks)      | Unanswered. Decides L2. (v2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| O4  | **Does a firm block's record matter beyond "it happened"?** (hours worked → pay → Finance) | Unanswered. (v2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| O5  | ~~How does planning happen?~~                                                              | **Decided:** weekly sit-down + daily pool (see Planning). Still open: should the sit-down also show queues ("about how many chapters this week?") and next week's agenda?                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| O12 | ~~Plan dates: UTC or `DATE`?~~                                                             | **Decided:** moments = UTC `timestamptz`; plan days and due dates = `DATE`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| O10 | ~~Capture~~                                                                                | **Decided:** usually I add tasks fully in one go. In a rush, capture follows where I am: added inside a project → goes there; added anywhere else → **Inbox**. _Leaning:_ unsorted Inbox tasks show as a quiet count on Today ("3 unsorted") and at the top of the weekly sit-down.                                                                                                                                                                                                                                                                                                                                              |     | O6  | Catch-all projects never finish. Ongoing vs finite project kind later? | Workable for now. |
| O7  | LeetCode weekly quiz: queue item or dated task?                                            | Probably a dated task. Confirm.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| O8  | Availability: set by hand or inferred?                                                     | Later.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| O9  | ~~Correcting records~~                                                                     | **Decided:** no undo toast. Records are **simply editable**, like changing a status in Notion: tap again to un-tick, edit the Done date in details. _Leaning:_ edits are logged silently underneath (same as plan changes). "Immutable" is reworded to _Selah never rewrites history on its own; I can always correct it._ **Planner differs from Finance on purpose:** in Finance, plan (budget) and record (expense) are separate things, and an expense goes from 0 to 1 when it's paid. A task is done gradually, so in Planner the task stays a living plan and its records are the events along the way (worked on, done). |

### Ideas from the previous chat: status

| Idea                                           | Status                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| Floating vs pinned tasks in a queue            | **Superseded.** Queue items are dateless; "pinned" = a normal dated task. |
| Slipped vs overdue                             | **Decided** (Today view).                                                 |
| "At risk" warning (8 tasks, 6 slots)           | **Parked.** Would need real pace history.                                 |
| Per-day capacity template                      | **Superseded** by time blocks.                                            |
| Context requirement (laptop / phone OK / home) | Untested. Belongs with Availability.                                      |
| One slot holding a group of tasks              | **Answered.** A block holds several queues and tasks.                     |

---

## 6. Parked

- **Routines / habits.** Independent system, designed later. _Constraint now:_ keep the **Record** generic so habits can produce records later without a migration.
- **Pace-based "at risk" prediction.**
- **Insights from plan history.**
- **Reading / Study module.**
- **Weekly pattern for study blocks** / "copy last week".

---

## 7. Design notes (for implementation)

The tables, the rules and the screens are in [planner/v1-spec.md](planner/v1-spec.md), and how they fit Selah's architecture is in [ADR 0033](decisions/0033-planner-module.md). In short:

- **No owner columns** ([ADR 0028](decisions/0028-local-only.md)). Sharing would mean a hosted service with accounts, a stage of its own.
- **Moments** (record times, session start/end, the change log) are `TIMESTAMPTZ`. **Calendar days** (plan start, due date, prioritized day, the day a record happened) are `DATE`.
- **Status, started, slipped and the queue's next item are calculated** from the rows on the device ([ADR 0011](decisions/0011-derive-dont-store.md)), never stored.
- **Plan changes and record edits** go to an append-only change table, written by the `planner-core` rules.
