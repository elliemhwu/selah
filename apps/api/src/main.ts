import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { AppModule } from './app/app.module';
import { configureApp } from './app/configure-app';
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
  const app = configureApp(await NestFactory.create(AppModule));

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
  Logger.log(
    `🚀 API running on http://localhost:${port}/api (docs: /api/docs)`,
  );
}

bootstrap();
