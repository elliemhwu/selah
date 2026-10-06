import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ValidationError } from 'class-validator';
import type { Response } from 'express';
import {
  ConflictError,
  type FieldErrors,
  NotFoundError,
  RequestValidationError,
  RuleViolationError,
} from './errors';

/** RFC 9457 Problem Details (ADR 0017). */
export class ProblemDetailsDto {
  @ApiProperty({ example: 'about:blank' })
  type!: string;

  @ApiProperty({ example: 'Bad Request' })
  title!: string;

  @ApiProperty({ example: 400 })
  status!: number;

  @ApiPropertyOptional({ example: 'The request is invalid.' })
  detail?: string;

  @ApiPropertyOptional({
    description: 'Messages per field (400 and 422).',
    type: 'object',
    additionalProperties: { type: 'array', items: { type: 'string' } },
    example: { name: ['name should not be empty'] },
  })
  errors?: FieldErrors;
}

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Content',
  500: 'Internal Server Error',
};

/** Flattens class-validator errors into `{ "lines.0.amount": ["…"] }`. */
export function toFieldErrors(errors: ValidationError[], prefix = ''): FieldErrors {
  const result: FieldErrors = {};
  for (const error of errors) {
    const path = prefix ? `${prefix}.${error.property}` : error.property;
    if (error.constraints) result[path] = Object.values(error.constraints);
    if (error.children?.length) Object.assign(result, toFieldErrors(error.children, path));
  }
  return result;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProblemDetails');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const problem = this.toProblem(exception);
    response.status(problem.status).type('application/problem+json').json(problem);
  }

  private toProblem(exception: unknown): ProblemDetailsDto {
    const problem = (status: number, detail?: string, errors?: FieldErrors) => ({
      type: 'about:blank',
      title: TITLES[status] ?? 'Error',
      status,
      ...(detail ? { detail } : {}),
      ...(errors ? { errors } : {}),
    });

    if (exception instanceof RequestValidationError) return problem(400, exception.message, exception.errors);
    if (exception instanceof NotFoundError) return problem(404, exception.message);
    if (exception instanceof ConflictError) return problem(409, exception.message);
    if (exception instanceof RuleViolationError) return problem(422, exception.message, exception.errors);
    if (exception instanceof HttpException) {
      // Framework errors such as an unknown route or malformed JSON.
      const status = exception.getStatus();
      return { ...problem(status, exception.message), title: TITLES[status] ?? HttpStatus[status] ?? 'Error' };
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return problem(500, 'Something went wrong.');
  }
}
