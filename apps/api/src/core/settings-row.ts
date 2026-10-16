import { ApiProperty } from '@nestjs/swagger';
import { CURRENCIES, type Currency, ISO_WEEKDAYS, type IsoWeekday } from '@selah/shared-types';
import { IsIn, IsInt, IsISO8601, Max, Min } from 'class-validator';
import type { Database } from '../database/database';
import { iso } from '../store/row';

/** The app settings (ADR 0024): a single row, which the app keys as 'settings'. */
export class SettingsRowDto {
  @ApiProperty({ enum: ['settings'] })
  @IsIn(['settings'])
  id!: 'settings';

  @ApiProperty({
    type: 'integer',
    enum: [...ISO_WEEKDAYS],
    example: 1,
    description: 'ISO day of week: 1 = Monday … 7 = Sunday.',
  })
  @IsInt()
  @Min(1)
  @Max(7)
  weekStartDay!: IsoWeekday;

  @ApiProperty({ enum: CURRENCIES, enumName: 'Currency', description: 'Preselected for new accounts and entries.' })
  @IsIn(CURRENCIES)
  defaultCurrency!: Currency;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  updatedAt!: string;
}

export const settingsTable = {
  /** The live settings row, or null until the settings are first saved. */
  async load(db: Database): Promise<SettingsRowDto | null> {
    const row = await db.selectFrom('core.settings').selectAll().where('deletedAt', 'is', null).executeTakeFirst();
    if (!row) return null;
    return {
      id: 'settings',
      weekStartDay: row.weekStartDay as IsoWeekday,
      defaultCurrency: row.defaultCurrency as Currency,
      updatedAt: iso(row.updatedAt),
    };
  },

  async save(trx: Database, settings: SettingsRowDto): Promise<void> {
    const values = {
      weekStartDay: settings.weekStartDay,
      defaultCurrency: settings.defaultCurrency,
      updatedAt: settings.updatedAt,
    };
    const updated = await trx.updateTable('core.settings').set(values).where('deletedAt', 'is', null).executeTakeFirst();
    if (updated.numUpdatedRows === 0n) {
      await trx
        .insertInto('core.settings')
        .values({ ...values, createdAt: settings.updatedAt })
        .execute();
    }
  },

  async clear(trx: Database): Promise<void> {
    await trx.deleteFrom('core.settings').execute();
  },
};
