import { ApiProperty } from '@nestjs/swagger';
import { CHANGE_ENTITIES, type ChangeEntity } from '@selah/shared-types';
import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { fromExcluded, inSaveOrder, iso, isoOrNull, StoredRowDto, type StoreTable } from '../../store/row';

/** One change to a task's plan or due date, or to a record, kept for reflecting later (ADR 0033). */
export class ChangeLogRowDto extends StoredRowDto {
  @ApiProperty({ enum: CHANGE_ENTITIES, enumName: 'ChangeEntity' })
  @IsIn(CHANGE_ENTITIES)
  entity!: ChangeEntity;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  entityId!: string;

  @ApiProperty({ maxLength: 50, example: 'plan' })
  @IsString()
  @MaxLength(50)
  field!: string;

  @ApiProperty({ type: 'string', maxLength: 50, nullable: true, example: '2026-11-04/day' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  oldValue!: string | null;

  @ApiProperty({ type: 'string', maxLength: 50, nullable: true, example: 'later' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  newValue!: string | null;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  changedAt!: string;
}

const COLUMNS = ['entity', 'entityId', 'field', 'oldValue', 'newValue', 'changedAt', 'createdAt', 'updatedAt', 'deletedAt'] as const;

export const changeLogTable: StoreTable<ChangeLogRowDto> = {
  async load(db) {
    const rows = await db.selectFrom('planner.changeLog').selectAll().orderBy('id').execute();
    return rows.map((r) => ({
      id: r.id,
      entity: r.entity as ChangeEntity,
      entityId: r.entityId,
      field: r.field,
      oldValue: r.oldValue,
      newValue: r.newValue,
      changedAt: iso(r.changedAt),
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
      deletedAt: isoOrNull(r.deletedAt),
    }));
  },

  async save(trx, rows) {
    if (rows.length === 0) return;
    await trx
      .insertInto('planner.changeLog')
      .values(inSaveOrder(rows))
      .onConflict((oc) => oc.column('id').doUpdateSet(fromExcluded(COLUMNS)))
      .execute();
  },

  async clear(trx) {
    await trx.deleteFrom('planner.changeLog').execute();
  },
};
