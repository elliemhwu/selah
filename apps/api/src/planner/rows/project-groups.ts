import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { fromExcluded, inSaveOrder, iso, isoOrNull, StoredRowDto, type StoreTable } from '../../store/row';

/** A group: an optional layer between an area and its projects. Groups can nest (ADR 0033). */
export class ProjectGroupRowDto extends StoredRowDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  areaId!: string;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true, description: 'The group it sits in, in the same area.' })
  @IsOptional()
  @IsUUID('all')
  parentGroupId!: string | null;

  @ApiProperty({ maxLength: 100, example: '華冠' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ format: 'double' })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  position!: number;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  archivedAt!: string | null;
}

const COLUMNS = ['areaId', 'parentGroupId', 'name', 'position', 'archivedAt', 'createdAt', 'updatedAt', 'deletedAt'] as const;

export const projectGroupsTable: StoreTable<ProjectGroupRowDto> = {
  async load(db) {
    const rows = await db.selectFrom('planner.projectGroups').selectAll().orderBy('id').execute();
    return rows.map((r) => ({
      id: r.id,
      areaId: r.areaId,
      parentGroupId: r.parentGroupId,
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
    // A nested group refers to its parent, so parents go first.
    await trx
      .insertInto('planner.projectGroups')
      .values(parentsFirst(inSaveOrder(rows)))
      .onConflict((oc) => oc.column('id').doUpdateSet(fromExcluded(COLUMNS)))
      .execute();
  },

  async clear(trx) {
    await trx.updateTable('planner.projectGroups').set({ parentGroupId: null }).execute();
    await trx.deleteFrom('planner.projectGroups').execute();
  },
};

/** Rows ordered so each parent in the same save comes before its children. */
function parentsFirst(rows: ProjectGroupRowDto[]): ProjectGroupRowDto[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const done = new Set<string>();
  const ordered: ProjectGroupRowDto[] = [];
  const visit = (row: ProjectGroupRowDto, path: Set<string>) => {
    if (done.has(row.id) || path.has(row.id)) return;
    path.add(row.id);
    const parent = row.parentGroupId ? byId.get(row.parentGroupId) : undefined;
    if (parent) visit(parent, path);
    done.add(row.id);
    ordered.push(row);
  };
  for (const row of rows) visit(row, new Set());
  return ordered;
}
