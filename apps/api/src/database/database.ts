import { Logger } from '@nestjs/common';
import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import { Pool, types } from 'pg';
import type { DB } from './db.generated';

// DATE columns are local calendar dates (ADR 0014): keep them as 'YYYY-MM-DD'
// strings instead of letting pg turn them into JS Dates at midnight UTC.
// NUMERIC already comes back as a string, which ADR 0006 relies on.
const PG_DATE_OID = 1082;
types.setTypeParser(PG_DATE_OID, (value) => value);

export type Database = Kysely<DB>;

export function createDatabase(connectionString: string): Database {
  const pool = new Pool({ connectionString });
  // An idle connection can drop (e.g. Postgres restarts). Without a listener
  // pg rethrows the error and crashes the process; the pool reconnects anyway.
  pool.on('error', (err) => {
    Logger.warn(`Idle database connection lost: ${err.message}`, 'Database');
  });
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool }),
    plugins: [new CamelCasePlugin()],
  });
}
