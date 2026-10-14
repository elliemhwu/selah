# 0002. OpenAPI/Swagger from day one

- Status: Accepted
- Date: 2026-10-05

## Context

The API will be rewritten in .NET ([0001](0001-monorepo-and-stack.md)). The frontend must not notice the switch.

## Decision

- NestJS uses `@nestjs/swagger`, and every endpoint, DTO, enum and error response is fully decorated.
- The generated OpenAPI document is the **API contract**. Swagger UI is served at `/api/docs`.
- REST conventions: resource-style URLs under `/api/v1/...`, JSON in camelCase, ISO-8601 dates, money as decimal strings ([0006](0006-money-representation.md)).

## Consequences

- The .NET rewrite is done when it serves an equivalent OpenAPI document.
- `libs/api-client` is generated from the spec ([0015](0015-api-client-generation.md)).
