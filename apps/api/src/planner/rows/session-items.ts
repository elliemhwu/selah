import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsUUID } from 'class-validator';
import { fromExcluded, inSaveOrder, iso, isoOrNull, StoredRowDto, type StoreTable } from '../../store/row';

/** What a session draws from: a queue (its next task) or one task (ADR 0033). */
export class SessionItemRowDto extends StoredRowDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  sessionId!: string;

  @ApiProperty({
    type: 'string',
    format: 'uuid',
    nullable: true,
    description: 'Set for a queue. Exactly one of projectId and taskId is set.',
  })
  @IsOptional()
  @IsUUID('all')
  projectId!: string | null;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true, description: 'Set for one task.' })
  @IsOptional()
  @IsUUID('all')
  taskId!: string | null;

  @ApiProperty({ format: 'double' })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  position!: number;
}

const COLUMNS = ['sessionId', 'projectId', 'taskId', 'position', 'createdAt', 'updatedAt', 'deletedAt'] as const;

export const sessionItemsTable: StoreTable<SessionItemRowDto> = {
  async load(db) {
    const rows = await db.selectFrom('planner.sessionItems').selectAll().orderBy('id').execute();
    return rows.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      projectId: r.projectId,
      taskId: r.taskId,
      position: r.position,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
      deletedAt: isoOrNull(r.deletedAt),
    }));
  },

  async save(trx, rows) {
    if (rows.length === 0) return;
    await trx
      .insertInto('planner.sessionItems')
      .values(inSaveOrder(rows))
      .onConflict((oc) => oc.column('id').doUpdateSet(fromExcluded(COLUMNS)))
      .execute();
  },

  async clear(trx) {
    await trx.deleteFrom('planner.sessionItems').execute();
  },
};
