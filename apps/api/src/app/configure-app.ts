import { type INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { requireAccessToken } from '../common/access-token';
import { RequestValidationError } from '../common/errors';
import { ProblemDetailsFilter, toFieldErrors } from '../common/problem-details';

export interface AppOptions {
  /** Required on every request but the health check when set (ADR 0028). */
  accessToken?: string;
  /** Browser origins allowed to call the API, such as the hosted app. */
  corsOrigins?: string[];
}

/** The options from `API_ACCESS_TOKEN` and `API_CORS_ORIGINS` (comma-separated). */
export function appOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): AppOptions {
  const origins = (env['API_CORS_ORIGINS'] ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  return { accessToken: env['API_ACCESS_TOKEN'] || undefined, corsOrigins: origins };
}

/** Shared by main.ts and the integration tests, so both run the same app. */
export function configureApp(app: INestApplication, options: AppOptions = {}): INestApplication {
  if (options.corsOrigins?.length) {
    app.enableCors({
      origin: options.corsOrigins,
      methods: ['GET', 'PUT', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      maxAge: 86_400,
    });
  }
  if (options.accessToken) app.use(requireAccessToken(options.accessToken));
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
