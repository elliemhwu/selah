// Framework-free errors thrown by services (ADR 0017). The Problem Details
// filter maps them to HTTP status codes, so domain code never imports NestJS
// HTTP exceptions. The rule errors come from finance-core, which the device
// shares (ADR 0025).

import type { FieldErrors } from '@selah/finance-core';

export { ConflictError, type FieldErrors, NotFoundError, RuleViolationError } from '@selah/finance-core';

/** 400: the request shape is invalid (from the ValidationPipe). */
export class RequestValidationError extends Error {
  override name = 'RequestValidationError';
  constructor(readonly errors: FieldErrors) {
    super('The request is invalid.');
  }
}
