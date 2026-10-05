import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { AppModule } from './app/app.module';
import { buildOpenApiDocument } from './openapi';

function loadEnv(): void {
  try {
    process.loadEnvFile('.env');
  } catch {
    // No .env file: rely on the real environment.
  }
}

async function bootstrap() {
  loadEnv();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // Routes are /api/v1/... (ADR 0002).
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();

  const document = buildOpenApiDocument(app);

  // `pnpm openapi` writes the contract to a file and exits.
  const exportPath = process.env['OPENAPI_EXPORT_PATH'];
  if (exportPath) {
    writeFileSync(exportPath, JSON.stringify(document, null, 2) + '\n');
    await app.close();
    return;
  }

  SwaggerModule.setup('api/docs', app, document);

  const port = process.env['API_PORT'] || 3000;
  await app.listen(port);
  Logger.log(`🚀 API running on http://localhost:${port}/api (docs: /api/docs)`);
}

bootstrap();
