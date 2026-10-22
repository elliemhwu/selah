import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';
import { fromExcluded, inSaveOrder, iso, isoOrNull, StoredRowDto, type StoreTable } from '../../store/row';

/** A comment: a later reply to exactly one journal or one moment (ADR 0030). The body is never logged. */
export class CommentRowDto extends StoredRowDto {
  @ApiProperty({
    type: 'string',
    format: 'uuid',
    nullable: true,
    description: 'Set when it replies to a journal. Exactly one of journalId and momentId is set.',
  })
  @IsOptional()
  @IsUUID('all')
  journalId!: string | null;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true, description: 'Set when it replies to a moment.' })
  @IsOptional()
  @IsUUID('all')
  momentId!: string | null;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  writtenAt!: string;

  @ApiProperty()
  @IsString()
  body!: string;
}

const COLUMNS = ['journalId', 'momentId', 'writtenAt', 'body', 'createdAt', 'updatedAt', 'deletedAt'] as const;

export const commentsTable: StoreTable<CommentRowDto> = {
  async load(db) {
    const rows = await db.selectFrom('journal.comments').selectAll().orderBy('id').execute();
    return rows.map((r) => ({
      id: r.id,
      journalId: r.journalId,
      momentId: r.momentId,
      writtenAt: iso(r.writtenAt),
      body: r.body,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
      deletedAt: isoOrNull(r.deletedAt),
    }));
  },

  async save(trx, rows) {
    if (rows.length === 0) return;
    await trx
      .insertInto('journal.comments')
      .values(inSaveOrder(rows))
      .onConflict((oc) => oc.column('id').doUpdateSet(fromExcluded(COLUMNS)))
      .execute();
  },

  async clear(trx) {
    await trx.deleteFrom('journal.comments').execute();
  },
};
