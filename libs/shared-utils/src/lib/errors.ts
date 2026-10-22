// Framework-free errors thrown by every module's rules (ADR 0017, 0025, 0030).
// The API maps them to Problem Details; the device shows them on the form that failed.

/** Messages per field, keyed by the input's field path, e.g. `lines.1.amount`. */
export type FieldErrors = Record<string, string[]>;

/** The thing doesn't exist (HTTP 404). */
export class NotFoundError extends Error {
  override name = 'NotFoundError';
}

/** Duplicate, deleted, or still in use (HTTP 409). */
export class ConflictError extends Error {
  override name = 'ConflictError';
}

/** The input is well-formed but a business rule refuses it (HTTP 422). */
export class RuleViolationError extends Error {
  override name = 'RuleViolationError';
  constructor(
    message: string,
    readonly errors?: FieldErrors,
  ) {
    super(message);
  }
}

/** Collects field errors, then throws them together. */
export class FieldErrorCollector {
  constructor(
    private readonly prefix = '',
    readonly errors: FieldErrors = {},
  ) {}

  add(field: string, message: string): void {
    (this.errors[this.prefix + field] ??= []).push(message);
  }

  /** A collector writing into the same errors under a longer prefix, e.g. `records.2.`. */
  nested(prefix: string): FieldErrorCollector {
    return new FieldErrorCollector(this.prefix + prefix, this.errors);
  }

  get empty(): boolean {
    return Object.keys(this.errors).length === 0;
  }

  /** Throws a RuleViolationError with every collected error, if there are any. */
  throwIfAny(message: string): void {
    if (!this.empty) throw new RuleViolationError(message, this.errors);
  }
}
