import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { fromExcluded, inSaveOrder, iso, isoOrNull, StoredRowDto, type StoreTable } from '../../store/row';

export class CategoryRowDto extends StoredRowDto {
  @ApiProperty({ maxLength: 100, example: 'Food' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('all')
  parentId!: string | null;

  @ApiProperty()
  @IsInt()
  sortOrder!: number;
}

const COLUMNS = ['name', 'parentId', 'sortOrder', 'createdAt', 'updatedAt', 'deletedAt'] as const;

export const categoriesTable: StoreTable<CategoryRowDto> = {
  async load(db) {
    const rows = await db.selectFrom('finance.categories').selectAll().orderBy('id').execute();
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      parentId: r.parentId,
      sortOrder: r.sortOrder,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
      deletedAt: isoOrNull(r.deletedAt),
    }));
  },

  async save(trx, rows) {
    if (rows.length === 0) return;
    await trx
      .insertInto('finance.categories')
      .values(parentsFirst(inSaveOrder(rows)))
      .onConflict((oc) => oc.column('id').doUpdateSet(fromExcluded(COLUMNS)))
      .execute();
  },

  async clear(trx) {
    await trx.deleteFrom('finance.categories').execute();
  },
};

/** Orders the rows so a parent saved in the same batch comes before its children (the parent_id foreign key). */
function parentsFirst(rows: readonly CategoryRowDto[]): CategoryRowDto[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered: CategoryRowDto[] = [];
  const placed = new Set<string>();
  const place = (row: CategoryRowDto, path: Set<string>) => {
    if (placed.has(row.id) || path.has(row.id)) return;
    path.add(row.id);
    const parent = row.parentId ? byId.get(row.parentId) : undefined;
    if (parent) place(parent, path);
    placed.add(row.id);
    ordered.push(row);
  };
  for (const row of rows) place(row, new Set());
  return ordered;
}
