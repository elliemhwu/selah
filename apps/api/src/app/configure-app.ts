import { type INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { RequestValidationError } from '../common/errors';
import { ProblemDetailsFilter, toFieldErrors } from '../common/problem-details';

/** Shared by main.ts and the integration tests, so both run the same app. */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api');
  // Routes are /api/v1/... (ADR 0002).
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => new RequestValidationError(toFieldErrors(errors)),
    }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();
  return app;
}
