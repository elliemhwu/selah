import { ApiProperty } from '@nestjs/swagger';
import { CURRENCIES, type Currency, RECORD_TYPES, type RecordType } from '@selah/shared-types';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { IsLocalDate, IsLocalTime, IsMoney, IsRate } from '../../common/validation';
import {
  fromExcluded,
  hourMinute,
  inSaveOrder,
  iso,
  isoOrNull,
  StoredRowDto,
  type StoreTable,
} from '../../store/row';

// Records and their lines (ADR 0013, 0014, 0016). A record is saved as a
// whole: its lines are kept, replaced or soft-deleted with it.

export class RecordLineRowDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;

  @IsMoney({ description: 'In the record currency.' })
  amount!: string;

  @IsMoney({ description: 'Whole TWD.' })
  twdAmount!: string;

  @IsOptional()
  @IsRate({ nullable: true, description: 'Null for TWD records.' })
  fxRate!: string | null;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('all')
  categoryId!: string | null;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('all')
  budgetItemId!: string | null;

  @ApiProperty({ type: 'string', nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note!: string | null;
}

export class RecordRowDto extends StoredRowDto {
  @ApiProperty({ enum: RECORD_TYPES, enumName: 'RecordType' })
  @IsIn(RECORD_TYPES)
  type!: RecordType;

  @IsLocalDate()
  occurredOn!: string;

  @IsOptional()
  @IsLocalTime({ nullable: true })
  occurredAt!: string | null;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  accountId!: string;

  @ApiProperty({ enum: CURRENCIES, enumName: 'Currency' })
  @IsIn(CURRENCIES)
  currency!: Currency;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true, description: 'Transfer only.' })
  @IsOptional()
  @IsUUID('all')
  counterAccountId!: string | null;

  @IsOptional()
  @IsMoney({ nullable: true, description: 'Transfer only: the amount received.' })
  counterAmount!: string | null;

  @IsOptional()
  @IsMoney({ nullable: true, description: 'Adjustment only (ADR 0014).' })
  targetBalance!: string | null;

  @ApiProperty({ type: 'string', nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note!: string | null;

  @ApiProperty({ type: RecordLineRowDto, isArray: true, description: 'In display order.' })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RecordLineRowDto)
  lines!: RecordLineRowDto[];
}

const RECORD_COLUMNS = [
  'type',
  'occurredOn',
  'occurredAt',
  'accountId',
  'currency',
  'counterAccountId',
  'counterAmount',
  'targetBalance',
  'note',
  'createdAt',
  'updatedAt',
  'deletedAt',
] as const;
const LINE_COLUMNS = [
  'recordId',
  'amount',
  'twdAmount',
  'fxRate',
  'categoryId',
  'budgetItemId',
  'note',
  'sortOrder',
  'deletedAt',
] as const;

export const recordsTable: StoreTable<RecordRowDto> = {
  async load(db) {
    const [records, lines] = await Promise.all([
      db.selectFrom('finance.records').selectAll().orderBy('id').execute(),
      db.selectFrom('finance.recordLines').selectAll().where('deletedAt', 'is', null).orderBy('sortOrder').execute(),
    ]);
    const linesByRecord = new Map<string, RecordLineRowDto[]>();
    for (const l of lines) {
      const list = linesByRecord.get(l.recordId) ?? [];
      list.push({
        id: l.id,
        amount: l.amount,
        twdAmount: l.twdAmount,
        fxRate: l.fxRate,
        categoryId: l.categoryId,
        budgetItemId: l.budgetItemId,
        note: l.note,
      });
      linesByRecord.set(l.recordId, list);
    }
    return records.map((r) => ({
      id: r.id,
      type: r.type as RecordType,
      occurredOn: r.occurredOn,
      occurredAt: hourMinute(r.occurredAt),
      accountId: r.accountId,
      currency: r.currency as Currency,
      counterAccountId: r.counterAccountId,
      counterAmount: r.counterAmount,
      targetBalance: r.targetBalance,
      note: r.note,
      lines: linesByRecord.get(r.id) ?? [],
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
      deletedAt: isoOrNull(r.deletedAt),
    }));
  },

  async save(trx, rows) {
    if (rows.length === 0) return;
    const records = inSaveOrder(rows);
    await trx
      .insertInto('finance.records')
      .values(records.map(({ lines: _, ...record }) => record))
      .onConflict((oc) => oc.column('id').doUpdateSet(fromExcluded(RECORD_COLUMNS)))
      .execute();

    const lines = records.flatMap((record) =>
      record.lines.map((line, index) => ({ ...line, recordId: record.id, sortOrder: index, deletedAt: null })),
    );
    // A record's lines are the ones it was sent with; any others it had are soft-deleted.
    let removed = trx
      .updateTable('finance.recordLines')
      .set({ deletedAt: new Date() })
      .where(
        'recordId',
        'in',
        records.map((r) => r.id),
      )
      .where('deletedAt', 'is', null);
    if (lines.length) removed = removed.where('id', 'not in', lines.map((l) => l.id));
    await removed.execute();
    if (lines.length) {
      await trx
        .insertInto('finance.recordLines')
        .values(lines)
        .onConflict((oc) => oc.column('id').doUpdateSet(fromExcluded(LINE_COLUMNS)))
        .execute();
    }
  },

  async clear(trx) {
    await trx.deleteFrom('finance.recordLines').execute();
    await trx.deleteFrom('finance.records').execute();
  },
};
