import { Inject, Injectable } from '@nestjs/common';
import { type Selectable, sql } from 'kysely';
import { DATABASE } from '../../database/database.module';
import type { Database } from '../../database/database';
import type { CoreSettings } from '../../database/db.generated';

export type SettingsRow = Selectable<CoreSettings>;

export interface SettingsValues {
  weekStartDay: number;
  defaultCurrency: string;
}

@Injectable()
export class SettingsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** The single live row, if the settings were ever saved. */
  findLive(): Promise<SettingsRow | undefined> {
    return this.db.selectFrom('core.settings').selectAll().where('deletedAt', 'is', null).executeTakeFirst();
  }

  /** The live row if it changed after `after` (or ever, when null); for sync (ADR 0028). */
  async changedSince(after: Date | null): Promise<SettingsRow | undefined> {
    const row = await this.findLive();
    return row && (!after || row.updatedAt > after) ? row : undefined;
  }

  /** Inserts the single live row, or replaces it, in one statement (the `settings_single_row` index). */
  async save(values: SettingsValues): Promise<void> {
    await this.db
      .insertInto('core.settings')
      .values(values)
      .onConflict((oc) => oc.expression(sql`(true)`).where('deletedAt', 'is', null).doUpdateSet(values))
      .execute();
  }
}
