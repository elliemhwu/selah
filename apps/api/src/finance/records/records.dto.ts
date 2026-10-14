import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CURRENCIES, type Currency, RECORD_TYPES, type RecordType } from '@selah/shared-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { IsLocalDate, IsLocalTime, IsMoney, IsRate } from '../../common/validation';

// ---- Responses ---------------------------------------------------------

export class RecordLineDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: 'string', example: '150.00', description: 'In the record currency; always positive.' })
  amount!: string;

  @ApiProperty({ type: 'string', example: '150.00', description: 'Whole TWD.' })
  twdAmount!: string;

  @ApiProperty({ type: 'string', nullable: true, example: null, description: 'Null for TWD records.' })
  fxRate!: string | null;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true })
  categoryId!: string | null;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true })
  budgetItemId!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  note!: string | null;
}

export class RecordDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: RECORD_TYPES, enumName: 'RecordType' })
  type!: RecordType;

  @ApiProperty({ type: 'string', format: 'date', example: '2026-10-06' })
  occurredOn!: string;

  @ApiProperty({ type: 'string', nullable: true, example: '12:30' })
  occurredAt!: string | null;

  @ApiProperty({ format: 'uuid' })
  accountId!: string;

  @ApiProperty({ enum: CURRENCIES, enumName: 'Currency' })
  currency!: Currency;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true, description: 'Transfer only.' })
  counterAccountId!: string | null;

  @ApiProperty({ type: 'string', nullable: true, description: 'Transfer only: the amount received.' })
  counterAmount!: string | null;

  @ApiProperty({ type: 'string', nullable: true, description: 'Adjustment only (ADR 0014).' })
  targetBalance!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  note!: string | null;

  @ApiProperty({ type: RecordLineDto, isArray: true })
  lines!: RecordLineDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class LastUsedRateDto {
  @ApiProperty({ enum: CURRENCIES, enumName: 'Currency' })
  currency!: Currency;

  @ApiProperty({ type: 'string', example: '0.2083' })
  rate!: string;

  @ApiProperty({ type: 'string', format: 'date', example: '2026-10-06' })
  occurredOn!: string;
}

// ---- Requests ----------------------------------------------------------

export class RecordLineInput {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Client-generated. Keep it when editing so the line keeps its identity.',
  })
  @IsOptional()
  @IsUUID('all')
  id?: string;

  @IsMoney({ description: 'In the record currency; must be positive.' })
  amount!: string;

  @IsOptional()
  @IsRate({ required: false, description: 'Required for foreign-currency records; omit for TWD.' })
  fxRate?: string | null;

  @IsOptional()
  @IsMoney({
    required: false,
    description: 'Whole TWD. Omit to calculate it from amount × fxRate; set it to match a statement.',
  })
  twdAmount?: string | null;

  @ApiPropertyOptional({ type: 'string', format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('all')
  categoryId?: string | null;

  @ApiPropertyOptional({ type: 'string', format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('all')
  budgetItemId?: string | null;

  @ApiPropertyOptional({ type: 'string', nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class UpsertRecordDto {
  @ApiProperty({ enum: RECORD_TYPES, enumName: 'RecordType' })
  @IsIn(RECORD_TYPES)
  type!: RecordType;

  @IsLocalDate()
  occurredOn!: string;

  @IsOptional()
  @IsLocalTime({ required: false, nullable: true })
  occurredAt?: string | null;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  accountId!: string;

  @ApiProperty({ enum: CURRENCIES, enumName: 'Currency' })
  @IsIn(CURRENCIES)
  currency!: Currency;

  @ApiPropertyOptional({ type: 'string', format: 'uuid', nullable: true, description: 'Transfer only.' })
  @IsOptional()
  @IsUUID('all')
  counterAccountId?: string | null;

  @IsOptional()
  @IsMoney({ required: false, nullable: true, description: 'Transfer only: the amount received, in the receiving account currency.' })
  counterAmount?: string | null;

  @IsOptional()
  @IsMoney({ required: false, nullable: true, description: 'Adjustment only: the actual balance (ADR 0014).' })
  targetBalance?: string | null;

  @ApiPropertyOptional({ type: 'string', nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;

  @ApiProperty({
    type: RecordLineInput,
    isArray: true,
    description: 'One or more for income/expense; exactly one for a transfer; none for an adjustment.',
  })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RecordLineInput)
  lines!: RecordLineInput[];
}

export class BatchRecordInput extends UpsertRecordDto {
  @ApiProperty({ format: 'uuid', description: 'Client-generated.' })
  @IsUUID('all')
  id!: string;
}

export class UpsertRecordBatchDto {
  @ApiProperty({ type: BatchRecordInput, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BatchRecordInput)
  records!: BatchRecordInput[];
}

export class ListRecordsQuery {
  @IsLocalDate({ description: 'First day, inclusive.' })
  from!: string;

  @IsLocalDate({ description: 'Last day, inclusive.' })
  to!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Records from or to this account.' })
  @IsOptional()
  @IsUUID('all')
  accountId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Records with a line in this category.' })
  @IsOptional()
  @IsUUID('all')
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Records with a line on this budget item.' })
  @IsOptional()
  @IsUUID('all')
  budgetItemId?: string;

  @ApiPropertyOptional({ enum: RECORD_TYPES, enumName: 'RecordType' })
  @IsOptional()
  @IsIn(RECORD_TYPES)
  type?: RecordType;
}
