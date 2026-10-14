import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

// The OpenAPI document is the API contract (ADR 0002).
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Selah API')
    .setDescription('Personal life management API. Money amounts are decimal strings.')
    .setVersion('1')
    .build();
  return SwaggerModule.createDocument(app, config);
}
