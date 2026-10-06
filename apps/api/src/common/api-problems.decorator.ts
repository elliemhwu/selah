import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ProblemDetailsDto } from './problem-details';

const DESCRIPTIONS: Record<number, string> = {
  400: 'The request shape is invalid.',
  404: 'Not found.',
  409: 'Conflict: duplicate, deleted, or still in use.',
  422: 'A business rule refuses the request.',
};

/** Documents Problem Details error responses for an endpoint (ADR 0017). */
export function ApiProblems(...statuses: (400 | 404 | 409 | 422)[]) {
  return applyDecorators(
    ApiExtraModels(ProblemDetailsDto),
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: DESCRIPTIONS[status],
        content: {
          'application/problem+json': { schema: { $ref: getSchemaPath(ProblemDetailsDto) } },
        },
      }),
    ),
  );
}
