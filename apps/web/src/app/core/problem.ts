import { HttpErrorResponse } from '@angular/common/http';
import type { AbstractControl } from '@angular/forms';
import type { ApiSchemas } from '@selah/api-client';

export interface Problem {
  /** What to tell the user when no field matches. */
  message: string;
  /** Field errors from Problem Details, keyed by the API's field path (ADR 0017). */
  errors: Record<string, string[]>;
}

/**
 * Puts each field error on the form control `controlFor` returns, as a
 * `server` error. Returns the messages no control took, for a snack bar.
 */
export function applyFieldErrors(
  problem: Problem,
  controlFor: (field: string) => AbstractControl | null | undefined,
): string[] {
  const unmatched: string[] = [];
  for (const [field, messages] of Object.entries(problem.errors)) {
    const control = controlFor(field);
    if (control) {
      control.setErrors({ ...control.errors, server: messages.join(' ') });
      control.markAsTouched();
    } else {
      unmatched.push(...messages);
    }
  }
  if (unmatched.length === 0 && Object.keys(problem.errors).length === 0) unmatched.push(problem.message);
  return unmatched;
}

/** Reads an API error as Problem Details, or describes a network failure. */
export function problemOf(error: unknown): Problem {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return { message: $localize`:@@problem.offline:Can't reach the server. Check your connection and try again.`, errors: {} };
    }
    const body = error.error as Partial<ApiSchemas['ProblemDetailsDto']> | null;
    if (body && typeof body === 'object') {
      return {
        message: body.detail ?? body.title ?? error.statusText,
        errors: (body.errors as Record<string, string[]> | undefined) ?? {},
      };
    }
  }
  return { message: $localize`:@@problem.unexpected:Something went wrong. Please try again.`, errors: {} };
}
