import type { components, paths } from './schema.generated';

// Types generated from apps/api/openapi.json (ADR 0015). Regenerate with
// `pnpm openapi` after changing the API.

export type { components, paths };

/** DTOs from the contract, e.g. `ApiSchemas['HealthDto']`. */
export type ApiSchemas = components['schemas'];
