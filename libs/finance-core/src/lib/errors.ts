// The rule errors are shared by every module (ADR 0030); finance-core re-exports them.
export { ConflictError, FieldErrorCollector, type FieldErrors, NotFoundError, RuleViolationError } from '@selah/shared-utils';
