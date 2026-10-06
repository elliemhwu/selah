import { ParseUUIDPipe } from '@nestjs/common';
import { RequestValidationError } from './errors';

/** Validates an `:id` route parameter, reporting failures as Problem Details. */
export const UUID_PARAM = new ParseUUIDPipe({
  exceptionFactory: () => new RequestValidationError({ id: ['id must be a UUID'] }),
});
