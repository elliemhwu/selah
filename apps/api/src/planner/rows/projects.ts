import { ApiProperty } from '@nestjs/swagger';
import { PROJECT_MODES, type ProjectMode } from '@selah/shared-types';
import { IsIn, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { fromExcluded, inSaveOrder, iso, isoOrNull, StoredRowDto, type StoreTable } from '../../store/row';

/** A project: a list of tasks, or a queue done in order (ADR 0033). */
export class ProjectRowDto extends StoredRowDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  areaId!: string;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('all')
  groupId!: string | null;

  @ApiProperty({ maxLength: 100, example: 'LeetCode' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: PROJECT_MODES, enumName: 'ProjectMode' })
  @IsIn(PROJECT_MODES)
  mode!: ProjectMode;

  @ApiProperty({ format: 'double' })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  position!: number;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  archivedAt!: string | null;
}

const COLUMNS = ['areaId', 'groupId', 'name', 'mode', 'position', 'archivedAt', 'createdAt', 'updatedAt', 'deletedAt'] as const;

export const projectsTable: StoreTable<ProjectRowDto> = {
  async load(db) {
    const rows = await db.selectFrom('planner.projects').selectAll().orderBy('id').execute();
    return rows.map((r) => ({
      id: r.id,
      areaId: r.areaId,
      groupId: r.groupId,
      name: r.name,
      mode: r.mode as ProjectMode,
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
      .insertInto('planner.projects')
      .values(inSaveOrder(rows))
      .onConflict((oc) => oc.column('id').doUpdateSet(fromExcluded(COLUMNS)))
      .execute();
  },

  async clear(trx) {
    await trx.deleteFrom('planner.projects').execute();
  },
};
