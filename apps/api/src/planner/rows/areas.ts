import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { fromExcluded, inSaveOrder, iso, isoOrNull, StoredRowDto, type StoreTable } from '../../store/row';

/** A life domain, such as 工作 or 學習 (ADR 0033). */
export class AreaRowDto extends StoredRowDto {
  @ApiProperty({ maxLength: 100, example: '學習' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ format: 'double', description: 'Sort order; a moved row takes the midpoint of its neighbours.' })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  position!: number;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  archivedAt!: string | null;
}

const COLUMNS = ['name', 'position', 'archivedAt', 'createdAt', 'updatedAt', 'deletedAt'] as const;

export const areasTable: StoreTable<AreaRowDto> = {
  async load(db) {
    const rows = await db.selectFrom('planner.areas').selectAll().orderBy('id').execute();
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      position: r.position,
      archivedAt: isoOrNull(r.archivedAt),
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
      deletedAt: isoOrNull(r.deletedAt),
    }));
  },

  async save(trx, rows) {
    if (rows.length === 0) return;
    await trx
      .insertInto('planner.areas')
      .values(inSaveOrder(rows))
      .onConflict((oc) => oc.column('id').doUpdateSet(fromExcluded(COLUMNS)))
      .execute();
  },

  async clear(trx) {
    await trx.deleteFrom('planner.areas').execute();
  },
};
