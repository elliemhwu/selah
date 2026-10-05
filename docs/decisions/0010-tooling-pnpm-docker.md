# 0010. pnpm and Docker Compose for local Postgres

- Status: **Proposed**
- Date: 2026-10-05

## Context
Setting up a new device should be fast and give identical results on every machine.

## Decision
- **Node 24 LTS**, pinned in `.nvmrc` and `package.json#engines`.
- **pnpm** as the package manager, pinned through `package.json#packageManager`. It is fast and strict, and Nx supports it well.
- **PostgreSQL 18** in **Docker Compose** (`docker-compose.yml`), with a named volume for data. Connection settings come from `.env`; `.env.example` is committed.

## Consequences
- A new device needs Git, Node, pnpm and Docker Desktop. See [README](../../README.md).
- Data lives in the device's Docker volume and **is not synced between devices**. Use `pg_dump` / restore to copy data if needed.

## Alternatives considered
- **npm:** works fine, but it is slower and less strict about dependencies.
- **A native Postgres install:** avoids Docker, but every device would need manual setup and the versions could drift.
