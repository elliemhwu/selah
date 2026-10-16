import { ApiProperty } from '@nestjs/swagger';
import { BUDGET_TRANSFER_KINDS, type BudgetTransferKind } from '@selah/shared-types';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { IsLocalDate, IsLocalTime, IsMoney } from '../../common/validation';
import {
  fromExcluded,
  hourMinute,
  inSaveOrder,
  iso,
  isoOrNull,
  StoredRowDto,
  type StoreTable,
} from '../../store/row';

/** A budget transfer (ADR 0019). Computed resets are not stored. */
export class BudgetTransferRowDto extends StoredRowDto {
  @ApiProperty({ enum: BUDGET_TRANSFER_KINDS, enumName: 'BudgetTransferKind' })
  @IsIn(BUDGET_TRANSFER_KINDS)
  kind!: BudgetTransferKind;

  @IsLocalDate()
  occurredOn!: string;

  @IsOptional()
  @IsLocalTime({ nullable: true })
  occurredAt!: string | null;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  fromItemId!: string;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true, description: 'Null only for a reset that dropped the leftover.' })
  @IsOptional()
  @IsUUID('all')
  toItemId!: string | null;

  @IsMoney({ description: 'Whole TWD.' })
  amount!: string;

  @ApiProperty({ type: 'string', nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note!: string | null;
}

const COLUMNS = [
  'kind',
  'occurredOn',
  'occurredAt',
  'fromItemId',
  'toItemId',
  'amount',
  'note',
  'createdAt',
  'updatedAt',
  'deletedAt',
] as const;

export const budgetTransfersTable: StoreTable<BudgetTransferRowDto> = {
  async load(db) {
    const rows = await db.selectFrom('finance.budgetTransfers').selectAll().orderBy('id').execute();
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as BudgetTransferKind,
      occurredOn: r.occurredOn,
      occurredAt: hourMinute(r.occurredAt),
      fromItemId: r.fromItemId,
      toItemId: r.toItemId,
      amount: r.amount,
      note: r.note,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
      deletedAt: isoOrNull(r.deletedAt),
    }));
  },

  async save(trx, rows) {
    if (rows.length === 0) return;
    await trx
      .insertInto('finance.budgetTransfers')
      .values(inSaveOrder(rows))
      .onConflict((oc) => oc.column('id').doUpdateSet(fromExcluded(COLUMNS)))
      .execute();
  },

  async clear(trx) {
    await trx.deleteFrom('finance.budgetTransfers').execute();
  },
};
