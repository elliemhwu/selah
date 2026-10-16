import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'kysely';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../app/app.module';
import { configureApp } from '../app/configure-app';
import { DATABASE } from '../database/database.module';
import type { Database } from '../database/database';

export interface TestApp {
  app: INestApplication;
  db: Database;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

/** The real app, configured like main.ts, on the test database. */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  return {
    app,
    db: app.get<Database>(DATABASE),
    http: () => request(app.getHttpServer()),
    close: () => app.close(),
  };
}

/** Empties every module table. Called before each test. */
export async function resetDatabase(db: Database): Promise<void> {
  const tables = await sql<{ name: string }>`
    select format('%I.%I', schemaname, tablename) as name
    from pg_tables where schemaname in ('core', 'finance')
  `.execute(db);
  if (tables.rows.length === 0) return;
  await sql.raw(`truncate ${tables.rows.map((t) => t.name).join(', ')} cascade`).execute(db);
}

export const newId = (): string => randomUUID();
