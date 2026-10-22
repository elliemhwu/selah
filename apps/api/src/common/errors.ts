// Framework-free errors thrown by services (ADR 0017). The Problem Details
// filter maps them to HTTP status codes, so domain code never imports NestJS
// HTTP exceptions. The rule errors come from shared-utils, which every module's
// rules and the device share (ADR 0025, 0030).

import type { FieldErrors } from '@selah/shared-utils';

export { ConflictError, type FieldErrors, NotFoundError, RuleViolationError } from '@selah/shared-utils';

/** 400: the request shape is invalid (from the ValidationPipe). */
export class RequestValidationError extends Error {
  override name = 'RequestValidationError';
  constructor(readonly errors: FieldErrors) {
    super('The request is invalid.');
  }
}
