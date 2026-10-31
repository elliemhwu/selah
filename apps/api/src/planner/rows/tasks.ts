import { ApiProperty } from '@nestjs/swagger';
import { PLAN_GRAINS, type PlanGrain } from '@selah/shared-types';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { IsLocalDate } from '../../common/validation';
import { fromExcluded, inSaveOrder, iso, isoOrNull, StoredRowDto, type StoreTable } from '../../store/row';

/** A task: a living plan. No project means the Inbox (ADR 0033). */
export class TaskRowDto extends StoredRowDto {
  @ApiProperty({ type: 'string', format: 'uuid', nullable: true, description: 'Null for the Inbox.' })
  @IsOptional()
  @IsUUID('all')
  projectId!: string | null;

  @ApiProperty({ maxLength: 300, example: 'Draft the weekly digest' })
  @IsString()
  @MaxLength(300)
  title!: string;

  @ApiProperty({ type: 'string', maxLength: 5000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes!: string | null;

  @ApiProperty({ format: 'double' })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  position!: number;

  @IsOptional()
  @IsLocalDate({ nullable: true })
  dueDate!: string | null;

  @IsOptional()
  @IsLocalDate({ nullable: true, description: "The plan's first day: the day, the week's first day, or the 1st." })
  planStart!: string | null;

  @ApiProperty({ enum: PLAN_GRAINS, enumName: 'PlanGrain', nullable: true })
  @IsOptional()
  @IsIn(PLAN_GRAINS)
  planGrain!: PlanGrain | null;

  @ApiProperty({ description: 'Unplanned on purpose.' })
  @IsBoolean()
  later!: boolean;

  @IsOptional()
  @IsLocalDate({ nullable: true, description: 'Prioritized only on this day.' })
  prioritizedOn!: string | null;
}

const COLUMNS = [
  'projectId',
  'title',
  'notes',
  'position',
  'dueDate',
  'planStart',
  'planGrain',
  'later',
  'prioritizedOn',
  'createdAt',
  'updatedAt',
  'deletedAt',
] as const;

export const tasksTable: StoreTable<TaskRowDto> = {
  async load(db) {
    const rows = await db.selectFrom('planner.tasks').selectAll().orderBy('id').execute();
    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      title: r.title,
      notes: r.notes,
      position: r.position,
      dueDate: r.dueDate,
      planStart: r.planStart,
      planGrain: r.planGrain as PlanGrain | null,
      later: r.later,
      prioritizedOn: r.prioritizedOn,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
      deletedAt: isoOrNull(r.deletedAt),
    }));
  },

  async save(trx, rows) {
    if (rows.length === 0) return;
    await trx
      .insertInto('planner.tasks')
      .values(inSaveOrder(rows))
      .onConflict((oc) => oc.column('id').doUpdateSet(fromExcluded(COLUMNS)))
      .execute();
  },

  async clear(trx) {
    await trx.deleteFrom('planner.tasks').execute();
  },
};
