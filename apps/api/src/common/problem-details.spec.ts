import type { ArgumentsHost } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { ConflictError, NotFoundError, RequestValidationError, RuleViolationError } from './errors';
import { ProblemDetailsFilter } from './problem-details';

function respond(exception: unknown) {
  const sent: { status?: number; type?: string; body?: unknown } = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    type(value: string) {
      sent.type = value;
      return this;
    },
    json(body: unknown) {
      sent.body = body;
      return this;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
  new ProblemDetailsFilter().catch(exception, host);
  return sent;
}

describe('ProblemDetailsFilter', () => {
  it.each([
    [new RequestValidationError({ name: ['bad'] }), 400],
    [new NotFoundError('gone'), 404],
    [new ConflictError('taken'), 409],
    [new RuleViolationError('nope', { amount: ['whole TWD'] }), 422],
    [new NotFoundException('Cannot GET /x'), 404],
  ])('maps %o to %i', (exception, status) => {
    const sent = respond(exception);
    expect(sent.status).toBe(status);
    expect(sent.type).toBe('application/problem+json');
    expect(sent.body).toMatchObject({ type: 'about:blank', status });
  });

  it('keeps field errors', () => {
    expect(respond(new RuleViolationError('nope', { amount: ['whole TWD'] })).body).toMatchObject({
      title: 'Unprocessable Content',
      detail: 'nope',
      errors: { amount: ['whole TWD'] },
    });
  });

  it('hides the details of unexpected errors', () => {
    const sent = respond(new Error('password=hunter2 in connection string'));
    expect(sent.status).toBe(500);
    expect(JSON.stringify(sent.body)).not.toContain('hunter2');
    expect(sent.body).toMatchObject({ title: 'Internal Server Error', detail: 'Something went wrong.' });
  });
});
