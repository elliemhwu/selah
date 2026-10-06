// Framework-free errors thrown by services (ADR 0017). The Problem Details
// filter maps them to HTTP status codes, so domain code never imports NestJS
// HTTP exceptions.

export type FieldErrors = Record<string, string[]>;

/** 404: the resource doesn't exist. */
export class NotFoundError extends Error {
  override name = 'NotFoundError';
}

/** 409: duplicate, deleted, or still in use. */
export class ConflictError extends Error {
  override name = 'ConflictError';
}

/** 422: the request is well-formed but a business rule refuses it. */
export class RuleViolationError extends Error {
  override name = 'RuleViolationError';
  constructor(
    message: string,
    readonly errors?: FieldErrors,
  ) {
    super(message);
  }
}

/** 400: the request shape is invalid (from the ValidationPipe). */
export class RequestValidationError extends Error {
  override name = 'RequestValidationError';
  constructor(readonly errors: FieldErrors) {
    super('The request is invalid.');
  }
}
