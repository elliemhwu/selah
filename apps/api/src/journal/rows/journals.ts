import { ApiProperty } from '@nestjs/swagger';
import { DATE_PRECISIONS, type DatePrecision } from '@selah/shared-types';
import { IsIn, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';
import { fromExcluded, inSaveOrder, iso, isoOrNull, StoredRowDto, type StoreTable } from '../../store/row';

/** A journal: the raw writing (ADR 0030). The body is stored as sent and never logged. */
export class JournalRowDto extends StoredRowDto {
  @ApiProperty({ type: 'string', format: 'uuid', nullable: true, description: 'The moment it belongs to, if any.' })
  @IsOptional()
  @IsUUID('all')
  momentId!: string | null;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  writtenAt!: string;

  @ApiProperty({ enum: DATE_PRECISIONS, enumName: 'DatePrecision', description: 'How sure `writtenAt` is.' })
  @IsIn(DATE_PRECISIONS)
  datePrecision!: DatePrecision;

  @ApiProperty()
  @IsString()
  body!: string;
}

const COLUMNS = ['momentId', 'writtenAt', 'datePrecision', 'body', 'createdAt', 'updatedAt', 'deletedAt'] as const;

export const journalsTable: StoreTable<JournalRowDto> = {
  async load(db) {
    const rows = await db.selectFrom('journal.journals').selectAll().orderBy('id').execute();
    return rows.map((r) => ({
      id: r.id,
      momentId: r.momentId,
      writtenAt: iso(r.writtenAt),
      datePrecision: r.datePrecision as DatePrecision,
      body: r.body,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
      deletedAt: isoOrNull(r.deletedAt),
    }));
  },

  async save(trx, rows) {
    if (rows.length === 0) return;
    await trx
      .insertInto('journal.journals')
      .values(inSaveOrder(rows))
      .onConflict((oc) => oc.column('id').doUpdateSet(fromExcluded(COLUMNS)))
      .execute();
  },

  async clear(trx) {
    await trx.deleteFrom('journal.journals').execute();
  },
};
