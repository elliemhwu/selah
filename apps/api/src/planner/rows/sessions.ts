import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';
import { fromExcluded, inSaveOrder, iso, isoOrNull, StoredRowDto, type StoreTable } from '../../store/row';

/** A Study-now block (ADR 0033). */
export class SessionRowDto extends StoredRowDto {
  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  startedAt!: string;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true, description: 'Null while it runs.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  endedAt!: string | null;
}

const COLUMNS = ['startedAt', 'endedAt', 'createdAt', 'updatedAt', 'deletedAt'] as const;

export const sessionsTable: StoreTable<SessionRowDto> = {
  async load(db) {
    const rows = await db.selectFrom('planner.sessions').selectAll().orderBy('id').execute();
    return rows.map((r) => ({
      id: r.id,
      startedAt: iso(r.startedAt),
      endedAt: isoOrNull(r.endedAt),
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
      deletedAt: isoOrNull(r.deletedAt),
    }));
  },

  async save(trx, rows) {
    if (rows.length === 0) return;
    await trx
      .insertInto('planner.sessions')
      .values(inSaveOrder(rows))
      .onConflict((oc) => oc.column('id').doUpdateSet(fromExcluded(COLUMNS)))
      .execute();
  },

  async clear(trx) {
    await trx.deleteFrom('planner.sessions').execute();
  },
};
