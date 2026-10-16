# 0007. Offline-ready data conventions

- Status: Accepted
- Date: 2026-10-05

## Context
The MVP runs locally and online-only. Offline entry with later sync is a likely future feature. Adding it later is cheap only if the data model was prepared for it from the start.

## Decision
Every table in every module:
- has a `UUID` primary key. The **client may generate it**; the server accepts a client-supplied id.
- has `created_at TIMESTAMPTZ` and `updated_at TIMESTAMPTZ`, with `updated_at` maintained by a trigger.
- uses **soft delete**: `deleted_at TIMESTAMPTZ NULL`. Normal queries filter on `deleted_at IS NULL`.

## Consequences
- A future sync protocol can be "send me rows changed since T", including deleted ones.
- Unique constraints need partial indexes (`WHERE deleted_at IS NULL`).
