import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { fromExcluded, inSaveOrder, iso, isoOrNull, StoredRowDto, type StoreTable } from '../../store/row';

/** A god note: what God would say to a journal (ADR 0030). The body is never logged. */
export class GodNoteRowDto extends StoredRowDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  journalId!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  writtenAt!: string;

  @ApiProperty()
  @IsString()
  body!: string;

  @ApiProperty({ type: 'string', maxLength: 100, nullable: true, example: 'Matthew 11:28' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  verseRef!: string | null;
}

const COLUMNS = ['journalId', 'writtenAt', 'body', 'verseRef', 'createdAt', 'updatedAt', 'deletedAt'] as const;

export const godNotesTable: StoreTable<GodNoteRowDto> = {
  async load(db) {
    const rows = await db.selectFrom('journal.godNotes').selectAll().orderBy('id').execute();
    return rows.map((r) => ({
      id: r.id,
      journalId: r.journalId,
      writtenAt: iso(r.writtenAt),
      body: r.body,
      verseRef: r.verseRef,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
      deletedAt: isoOrNull(r.deletedAt),
    }));
  },

  async save(trx, rows) {
    if (rows.length === 0) return;
    await trx
      .insertInto('journal.godNotes')
      .values(inSaveOrder(rows))
      .onConflict((oc) => oc.column('id').doUpdateSet(fromExcluded(COLUMNS)))
      .execute();
  },

  async clear(trx) {
    await trx.deleteFrom('journal.godNotes').execute();
  },
};
