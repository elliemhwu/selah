import { Kysely, PostgresDialect } from 'kysely';
import type { Pool } from 'pg';
import type { Database } from '../database/database';
import { HealthService } from './health.service';

function fakeDatabase(query: () => Promise<unknown>): Database {
  const pool = {
    connect: async () => ({ query, release: () => undefined }),
    end: async () => undefined,
  } as unknown as Pool;
  return new Kysely({ dialect: new PostgresDialect({ pool }) });
}

describe('HealthService', () => {
  it('reports ok when the database answers', async () => {
    const service = new HealthService(fakeDatabase(async () => ({ rows: [] })));
    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      database: 'ok',
    });
  });

  it('reports the database as unavailable when the query fails', async () => {
    const service = new HealthService(
      fakeDatabase(async () => {
        throw new Error('connection refused');
      }),
    );
    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      database: 'unavailable',
    });
  });
});
