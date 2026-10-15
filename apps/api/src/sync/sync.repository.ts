import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE } from '../database/database.module';
import type { Database } from '../database/database';

@Injectable()
export class SyncRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** The database's clock, which sets every `updated_at`; the API host's clock may differ. */
  async now(): Promise<Date> {
    const { rows } = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.db);
    return rows[0].now;
  }
}
