import { ConflictError, RuleViolationError } from './errors';

type PgError = { code?: string; constraint?: string; detail?: string };

const pgCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null ? (error as PgError).code : undefined;

/**
 * Turns a constraint the database refused into the store's errors (ADR 0017,
 * 0029): a duplicate is a 409, a broken reference or check a 422. Anything
 * else is passed on unchanged.
 */
export function toStoreError(error: unknown): unknown {
  const code = pgCode(error);
  if (!code) return error;
  const { constraint, detail } = error as PgError;
  const which = constraint ? ` (${constraint})` : '';
  if (code === '23505') return new ConflictError(`A row conflicts with one already stored${which}. ${detail ?? ''}`.trim());
  if (code === '23503') return new RuleViolationError(`A row refers to a row that isn't stored${which}. ${detail ?? ''}`.trim());
  if (code === '23514' || code === '23502') return new RuleViolationError(`A row breaks a database rule${which}.`);
  return error;
}
