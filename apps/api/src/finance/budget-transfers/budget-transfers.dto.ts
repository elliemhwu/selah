import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BUDGET_TRANSFER_KINDS, type BudgetTransferKind } from '@selah/shared-types';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { IsLocalDate, IsLocalTime, IsMoney } from '../../common/validation';

export class BudgetTransferDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: BUDGET_TRANSFER_KINDS, enumName: 'BudgetTransferKind' })
  kind!: BudgetTransferKind;

  @ApiProperty({ type: 'string', format: 'date', example: '2026-10-31' })
  occurredOn!: string;

  @ApiProperty({ type: 'string', nullable: true, example: '21:00' })
  occurredAt!: string | null;

  @ApiProperty({ format: 'uuid' })
  fromItemId!: string;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true, description: 'Null only for a stored reset that dropped the leftover.' })
  toItemId!: string | null;

  @ApiProperty({ type: 'string', example: '500.00', description: 'Whole TWD.' })
  amount!: string;

  @ApiProperty({ type: 'string', nullable: true })
  note!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class UpsertBudgetTransferDto {
  @IsLocalDate()
  occurredOn!: string;

  @IsOptional()
  @IsLocalTime({ required: false, nullable: true })
  occurredAt?: string | null;

  @ApiProperty({ format: 'uuid', description: 'The budget item the amount leaves.' })
  @IsUUID('all')
  fromItemId!: string;

  @ApiProperty({ format: 'uuid', description: 'The budget item that receives it.' })
  @IsUUID('all')
  toItemId!: string;

  @IsMoney({ description: 'Whole TWD; must be positive.' })
  amount!: string;

  @ApiPropertyOptional({ type: 'string', nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class ListBudgetTransfersQuery {
  @IsLocalDate({ description: 'First day, inclusive.' })
  from!: string;

  @IsLocalDate({ description: 'Last day, inclusive.' })
  to!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Transfers from or to this item.' })
  @IsOptional()
  @IsUUID('all')
  budgetItemId?: string;
}
