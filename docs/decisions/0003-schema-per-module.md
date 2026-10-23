# 0003. One Postgres schema per module

- Status: Accepted
- Date: 2026-10-05

## Context
Selah will contain several life modules. Each should stay independent, while still allowing links between modules, e.g. a future Events record pointing to a finance record.

## Decision
- Each module owns its own Postgres schema: `finance`, and later others.
- App-wide data that isn't specific to a module (settings such as the week start day) goes in a `core` schema.
- Modules link to each other only through **foreign keys** to another module's primary keys. A module never writes to another module's tables.

## Consequences
- Modules can be developed, migrated and eventually extracted on their own.
- There are no `user_id` columns while the app has a single user ([requirements §6](../finance/requirements.md)). Adding multi-user support later means a migration that adds an owner column.
