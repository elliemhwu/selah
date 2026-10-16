import { ApiProperty } from '@nestjs/swagger';
import {
  ANCHORS,
  type Anchor,
  CADENCES,
  type Cadence,
  PERCENT_BASES,
  type PercentBase,
  RESET_ACTIONS,
  RESET_CYCLES,
  type ResetAction,
  type ResetCycle,
  SECTIONS,
  type Section,
} from '@selah/shared-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { randomUUID } from 'node:crypto';
import { IsLocalDate, IsMoney, IsPercent, IsYearMonth } from '../../common/validation';
import {
  fromExcluded,
  inSaveOrder,
  iso,
  isoOrNull,
  StoredRowDto,
  type StoreTable,
  toFirstOfMonth,
  toMonth,
} from '../../store/row';

// A budget plan version is saved as a whole (ADR 0012, 0018): the version row,
// the stable budget items, one item row per item in the version, and the
// items' monthly overrides. Item and override rows are matched to the ones
// already stored (by item and by month), so unchanged rows keep their ids;
// rows left out are soft-deleted.

export class PlanOverrideRowDto {
  @IsYearMonth()
  month!: string;

  @IsMoney({ description: 'Whole TWD for that month.' })
  amount!: string;
}

export class PlanItemRowDto {
  @ApiProperty({ format: 'uuid', description: 'The stable item id (ADR 0012).' })
  @IsUUID('all')
  budgetItemId!: string;

  @ApiProperty({ enum: SECTIONS, enumName: 'Section' })
  @IsIn(SECTIONS)
  section!: Section;

  @ApiProperty({ maxLength: 100, example: 'Daily Food' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('all')
  parentItemId!: string | null;

  @ApiProperty({ enum: CADENCES, enumName: 'Cadence' })
  @IsIn(CADENCES)
  cadence!: Cadence;

  @ApiProperty({ type: 'integer', nullable: true, minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  cadenceMonth!: number | null;

  @IsOptional()
  @IsLocalDate({ nullable: true })
  cadenceDate!: string | null;

  @ApiProperty({ enum: ANCHORS, enumName: 'Anchor' })
  @IsIn(ANCHORS)
  anchor!: Anchor;

  @IsOptional()
  @IsMoney({ nullable: true })
  amount!: string | null;

  @IsOptional()
  @IsPercent({ nullable: true })
  percent!: string | null;

  @ApiProperty({ enum: PERCENT_BASES, enumName: 'PercentBase' })
  @IsIn(PERCENT_BASES)
  percentBase!: PercentBase;

  @ApiProperty()
  @IsBoolean()
  rollover!: boolean;

  @ApiProperty({ enum: RESET_CYCLES, enumName: 'ResetCycle', nullable: true })
  @IsOptional()
  @IsIn(RESET_CYCLES)
  resetCycle!: ResetCycle | null;

  @ApiProperty({ enum: RESET_ACTIONS, enumName: 'ResetAction', nullable: true })
  @IsOptional()
  @IsIn(RESET_ACTIONS)
  onReset!: ResetAction | null;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('all')
  carryToItemId!: string | null;

  @ApiProperty({ type: PlanOverrideRowDto, isArray: true })
  @IsArray()
  @ArrayMaxSize(120)
  @ValidateNested({ each: true })
  @Type(() => PlanOverrideRowDto)
  overrides!: PlanOverrideRowDto[];
}

export class PlanVersionRowDto extends StoredRowDto {
  @IsYearMonth({ description: 'The first month this version applies to.' })
  effectiveFromMonth!: string;

  @ApiProperty({ type: 'string', nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note!: string | null;

  @ApiProperty({ type: PlanItemRowDto, isArray: true, description: 'In display order.' })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PlanItemRowDto)
  items!: PlanItemRowDto[];
}

const VERSION_COLUMNS = ['effectiveFromMonth', 'note', 'createdAt', 'updatedAt', 'deletedAt'] as const;
const ITEM_COLUMNS = [
  'name',
  'parentItemId',
  'cadence',
  'cadenceMonth',
  'cadenceDate',
  'anchor',
  'amount',
  'percent',
  'percentBase',
  'rollover',
  'resetCycle',
  'onReset',
  'carryToItemId',
  'sortOrder',
  'deletedAt',
] as const;
const OVERRIDE_COLUMNS = ['amount', 'deletedAt'] as const;

export const planVersionsTable: StoreTable<PlanVersionRowDto> = {
  async load(db) {
    const [versions, items, overrides] = await Promise.all([
      db.selectFrom('finance.budgetPlanVersions').selectAll().orderBy('id').execute(),
      db
        .selectFrom('finance.budgetItemVersions as iv')
        .innerJoin('finance.budgetItems as bi', 'bi.id', 'iv.budgetItemId')
        .selectAll('iv')
        .select('bi.section')
        .where('iv.deletedAt', 'is', null)
        .orderBy('iv.sortOrder')
        .execute(),
      db
        .selectFrom('finance.budgetItemOverrides')
        .select(['budgetItemVersionId', 'month', 'amount'])
        .where('deletedAt', 'is', null)
        .orderBy('month')
        .execute(),
    ]);
    const overridesByItem = groupBy(overrides, (o) => o.budgetItemVersionId);
    const itemsByVersion = groupBy(items, (i) => i.planVersionId);
    return versions.map((v) => ({
      id: v.id,
      effectiveFromMonth: toMonth(v.effectiveFromMonth),
      note: v.note,
      items: (itemsByVersion.get(v.id) ?? []).map((i) => ({
        budgetItemId: i.budgetItemId,
        section: i.section as Section,
        name: i.name,
        parentItemId: i.parentItemId,
        cadence: i.cadence as Cadence,
        cadenceMonth: i.cadenceMonth,
        cadenceDate: i.cadenceDate,
        anchor: i.anchor as Anchor,
        amount: i.amount,
        percent: i.percent,
        percentBase: i.percentBase as PercentBase,
        rollover: i.rollover,
        resetCycle: i.resetCycle as ResetCycle | null,
        onReset: i.onReset as ResetAction | null,
        carryToItemId: i.carryToItemId,
        overrides: (overridesByItem.get(i.id) ?? []).map((o) => ({ month: toMonth(o.month), amount: o.amount })),
      })),
      createdAt: iso(v.createdAt),
      updatedAt: iso(v.updatedAt),
      deletedAt: isoOrNull(v.deletedAt),
    }));
  },

  async save(trx, rows) {
    if (rows.length === 0) return;
    const versions = inSaveOrder(rows);
    const versionIds = versions.map((v) => v.id);
    const now = new Date();

    await trx
      .insertInto('finance.budgetPlanVersions')
      .values(
        versions.map(({ items: _, ...v }) => ({ ...v, effectiveFromMonth: toFirstOfMonth(v.effectiveFromMonth) })),
      )
      .onConflict((oc) => oc.column('id').doUpdateSet(fromExcluded(VERSION_COLUMNS)))
      .execute();

    // Stable items: created once; an item keeps its section (ADR 0018).
    const sections = new Map(versions.flatMap((v) => v.items.map((i) => [i.budgetItemId, i.section] as const)));
    if (sections.size) {
      await trx
        .insertInto('finance.budgetItems')
        .values([...sections].map(([id, section]) => ({ id, section })))
        .onConflict((oc) => oc.column('id').doNothing())
        .execute();
    }

    // Item rows, matched by version and item.
    const currentItems = await trx
      .selectFrom('finance.budgetItemVersions')
      .select(['id', 'planVersionId', 'budgetItemId'])
      .where('planVersionId', 'in', versionIds)
      .where('deletedAt', 'is', null)
      .execute();
    const itemRowId = new Map(currentItems.map((c) => [`${c.planVersionId}/${c.budgetItemId}`, c.id]));
    const itemRows = versions.flatMap((v) =>
      v.items.map(({ overrides, section: _, ...item }, index) => ({
        row: {
          ...item,
          id: itemRowId.get(`${v.id}/${item.budgetItemId}`) ?? randomUUID(),
          planVersionId: v.id,
          sortOrder: index,
          deletedAt: null,
        },
        overrides,
      })),
    );
    const keptItems = new Set(itemRows.map((i) => i.row.id));
    const removedItems = currentItems.filter((c) => !keptItems.has(c.id)).map((c) => c.id);
    if (removedItems.length) {
      await trx
        .updateTable('finance.budgetItemOverrides')
        .set({ deletedAt: now })
        .where('budgetItemVersionId', 'in', removedItems)
        .where('deletedAt', 'is', null)
        .execute();
      await trx.updateTable('finance.budgetItemVersions').set({ deletedAt: now }).where('id', 'in', removedItems).execute();
    }
    if (itemRows.length === 0) return;
    await trx
      .insertInto('finance.budgetItemVersions')
      .values(itemRows.map((i) => i.row))
      .onConflict((oc) => oc.column('id').doUpdateSet(fromExcluded(ITEM_COLUMNS)))
      .execute();

    // Overrides, matched by item row and month.
    const currentOverrides = await trx
      .selectFrom('finance.budgetItemOverrides')
      .select(['id', 'budgetItemVersionId', 'month'])
      .where('budgetItemVersionId', 'in', [...keptItems])
      .where('deletedAt', 'is', null)
      .execute();
    const overrideId = new Map(currentOverrides.map((c) => [`${c.budgetItemVersionId}/${c.month}`, c.id]));
    const overrideRows = itemRows.flatMap(({ row, overrides }) =>
      overrides.map((o) => {
        const month = toFirstOfMonth(o.month);
        return {
          id: overrideId.get(`${row.id}/${month}`) ?? randomUUID(),
          budgetItemVersionId: row.id,
          month,
          amount: o.amount,
          deletedAt: null,
        };
      }),
    );
    const keptOverrides = new Set(overrideRows.map((o) => o.id));
    const removedOverrides = currentOverrides.filter((c) => !keptOverrides.has(c.id)).map((c) => c.id);
    if (removedOverrides.length) {
      await trx.updateTable('finance.budgetItemOverrides').set({ deletedAt: now }).where('id', 'in', removedOverrides).execute();
    }
    if (overrideRows.length) {
      await trx
        .insertInto('finance.budgetItemOverrides')
        .values(overrideRows)
        .onConflict((oc) => oc.column('id').doUpdateSet(fromExcluded(OVERRIDE_COLUMNS)))
        .execute();
    }
  },

  async clear(trx) {
    await trx.deleteFrom('finance.budgetItemOverrides').execute();
    await trx.deleteFrom('finance.budgetItemVersions').execute();
    await trx.deleteFrom('finance.budgetPlanVersions').execute();
    await trx.deleteFrom('finance.budgetItems').execute();
  },
};

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(key(row)) ?? [];
    list.push(row);
    groups.set(key(row), list);
  }
  return groups;
}
