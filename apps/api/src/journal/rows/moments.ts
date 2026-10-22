import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsLocalDate } from '../../common/validation';
import { fromExcluded, inSaveOrder, iso, isoOrNull, StoredRowDto, type StoreTable } from '../../store/row';

/** A moment: what actually happened (ADR 0030). */
export class MomentRowDto extends StoredRowDto {
  @IsLocalDate()
  date!: string;

  @ApiProperty({ maxLength: 200, example: 'Moving day' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ type: 'string', maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary!: string | null;
}

const COLUMNS = ['date', 'title', 'summary', 'createdAt', 'updatedAt', 'deletedAt'] as const;

export const momentsTable: StoreTable<MomentRowDto> = {
  async load(db) {
    const rows = await db.selectFrom('journal.moments').selectAll().orderBy('id').execute();
    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      title: r.title,
      summary: r.summary,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
      deletedAt: isoOrNull(r.deletedAt),
    }));
  },

  async save(trx, rows) {
    if (rows.length === 0) return;
    await trx
      .insertInto('journal.moments')
      .values(inSaveOrder(rows))
      .onConflict((oc) => oc.column('id').doUpdateSet(fromExcluded(COLUMNS)))
      .execute();
  },

  async clear(trx) {
    await trx.deleteFrom('journal.moments').execute();
  },
};
