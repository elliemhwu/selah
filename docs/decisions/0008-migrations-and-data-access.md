# 0008. SQL migrations with dbmate, queries with Kysely

- Status: Accepted
- Date: 2026-10-05

## Context
The database will outlive the NestJS API ([0001](0001-monorepo-and-stack.md)). An ORM that defines the schema in TypeScript (TypeORM entities, Prisma schema) would tie the schema's source of truth to code that will be thrown away.

## Decision
- **Migrations:** plain SQL files in `db/migrations/`, run by [dbmate](https://github.com/amacneil/dbmate). dbmate is a single binary that doesn't depend on any language, and it is also installable through npm.
- **Data access in NestJS:** [Kysely](https://kysely.dev), a type-safe SQL query builder. Its row types are generated from the live database with `kysely-codegen`.
- The **database schema is the source of truth**. TypeScript types are generated from it, not the other way around.

## Consequences
- The .NET API can keep running the same dbmate migrations, or switch to EF Core after scaffolding models from the existing DB.
- More SQL is written by hand than with an ORM, which suits the report-heavy queries (rollover, plan vs. actual).

## Alternatives considered
- **TypeORM:** NestJS's default and the most familiar, but the schema lives in entity decorators.
- **Prisma:** a good developer experience, but its own schema language plus a migration engine that the .NET side can't use.
- **Drizzle:** close to SQL, but the schema is still defined in TypeScript.
