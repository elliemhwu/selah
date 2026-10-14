import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE } from '../database/database.module';
import type { Database } from '../database/database';
import type { HealthDto } from './health.dto';

@Injectable()
export class HealthService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async check(): Promise<HealthDto> {
    try {
      await sql`select 1`.execute(this.db);
      return { status: 'ok', database: 'ok' };
    } catch {
      return { status: 'ok', database: 'unavailable' };
    }
  }
}
