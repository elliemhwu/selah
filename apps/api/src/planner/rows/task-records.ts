import { ApiProperty } from '@nestjs/swagger';
import { TASK_RECORD_KINDS, type TaskRecordKind } from '@selah/shared-types';
import { IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { IsLocalDate } from '../../common/validation';
import { fromExcluded, inSaveOrder, iso, isoOrNull, StoredRowDto, type StoreTable } from '../../store/row';

/** What happened to a task: worked on it, done, or let go (ADR 0033). */
export class TaskRecordRowDto extends StoredRowDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  taskId!: string;

  @ApiProperty({ enum: TASK_RECORD_KINDS, enumName: 'TaskRecordKind' })
  @IsIn(TASK_RECORD_KINDS)
  kind!: TaskRecordKind;

  @IsLocalDate({ description: 'The local day it happened.' })
  occurredOn!: string;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true, description: 'Null when only the day is known.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  occurredAt!: string | null;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('all')
  sessionId!: string | null;
}

const COLUMNS = ['taskId', 'kind', 'occurredOn', 'occurredAt', 'sessionId', 'createdAt', 'updatedAt', 'deletedAt'] as const;

export const taskRecordsTable: StoreTable<TaskRecordRowDto> = {
  async load(db) {
    const rows = await db.selectFrom('planner.taskRecords').selectAll().orderBy('id').execute();
    return rows.map((r) => ({
      id: r.id,
      taskId: r.taskId,
      kind: r.kind as TaskRecordKind,
      occurredOn: r.occurredOn,
      occurredAt: isoOrNull(r.occurredAt),
      sessionId: r.sessionId,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
      deletedAt: isoOrNull(r.deletedAt),
    }));
  },

  async save(trx, rows) {
    if (rows.length === 0) return;
    // Soft-deleted rows go first (inSaveOrder), so a replaced outcome frees task_records_one_outcome.
    await trx
      .insertInto('planner.taskRecords')
      .values(inSaveOrder(rows))
      .onConflict((oc) => oc.column('id').doUpdateSet(fromExcluded(COLUMNS)))
      .execute();
  },

  async clear(trx) {
    await trx.deleteFrom('planner.taskRecords').execute();
  },
};
