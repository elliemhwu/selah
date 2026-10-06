import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CADENCES,
  type Cadence,
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
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsLocalDate, IsMoney, IsPercent, IsYearMonth } from '../../common/validation';

export const ANCHORS = ['amount', 'percent'] as const;
export type Anchor = (typeof ANCHORS)[number];
export const PERCENT_BASES = ['net_income', 'gross_income'] as const;
export type PercentBase = (typeof PERCENT_BASES)[number];

// ---- Shared item fields ------------------------------------------------

export class PlanOverrideDto {
  @IsYearMonth()
  month!: string;

  @IsMoney({ description: 'Whole TWD for that month.' })
  amount!: string;
}

export class PlanItemInput {
  @ApiProperty({ format: 'uuid', description: 'The stable item id (ADR 0012). New ids create items.' })
  @IsUUID('all')
  budgetItemId!: string;

  @ApiProperty({ enum: SECTIONS, enumName: 'Section', description: 'Fixed once the item exists.' })
  @IsIn(SECTIONS)
  section!: Section;

  @ApiProperty({ maxLength: 100, example: 'Daily Food' })
  @IsString()
  @Matches(/\S/, { message: 'name must not be blank' })
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ type: 'string', format: 'uuid', nullable: true, description: 'Another item in this version.' })
  @IsOptional()
  @IsUUID('all')
  parentItemId?: string | null;

  @ApiProperty({ enum: CADENCES, enumName: 'Cadence' })
  @IsIn(CADENCES)
  cadence!: Cadence;

  @ApiPropertyOptional({ type: 'integer', nullable: true, minimum: 1, maximum: 12, description: 'Yearly only.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  cadenceMonth?: number | null;

  @IsOptional()
  @IsLocalDate({ required: false, nullable: true, description: 'One-time only.' })
  cadenceDate?: string | null;

  @ApiProperty({ enum: ANCHORS, enumName: 'Anchor' })
  @IsIn(ANCHORS)
  anchor!: Anchor;

  @IsOptional()
  @IsMoney({ required: false, nullable: true, description: 'Whole TWD per cadence period. Anchor `amount` only.' })
  amount?: string | null;

  @IsOptional()
  @IsPercent({ required: false, nullable: true, description: 'Anchor `percent` only.' })
  percent?: string | null;

  @ApiPropertyOptional({ enum: PERCENT_BASES, enumName: 'PercentBase', default: 'net_income' })
  @IsOptional()
  @IsIn(PERCENT_BASES)
  percentBase?: PercentBase;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  rollover?: boolean;

  @ApiPropertyOptional({ enum: RESET_CYCLES, enumName: 'ResetCycle', nullable: true, description: 'Rollover only.' })
  @IsOptional()
  @IsIn(RESET_CYCLES)
  resetCycle?: ResetCycle | null;

  @ApiPropertyOptional({ enum: RESET_ACTIONS, enumName: 'ResetAction', nullable: true, description: 'When the cycle resets.' })
  @IsOptional()
  @IsIn(RESET_ACTIONS)
  onReset?: ResetAction | null;

  @ApiPropertyOptional({ type: 'string', format: 'uuid', nullable: true, description: 'For `onReset: carry`: an item in this version.' })
  @IsOptional()
  @IsUUID('all')
  carryToItemId?: string | null;

  @ApiPropertyOptional({ type: PlanOverrideDto, isArray: true, description: 'Monthly items only.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(120)
  @ValidateNested({ each: true })
  @Type(() => PlanOverrideDto)
  overrides?: PlanOverrideDto[];
}

export class UpsertPlanVersionDto {
  @IsYearMonth({ description: 'The first month this version applies to.' })
  effectiveFromMonth!: string;

  @ApiPropertyOptional({ type: 'string', nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;

  @ApiProperty({ type: PlanItemInput, isArray: true, description: 'In display order.' })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PlanItemInput)
  items!: PlanItemInput[];
}

// ---- Responses -----------------------------------------------------------

export class PlanItemDto {
  @ApiProperty({ format: 'uuid' })
  budgetItemId!: string;

  @ApiProperty({ enum: SECTIONS, enumName: 'Section' })
  section!: Section;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true })
  parentItemId!: string | null;

  @ApiProperty({ enum: CADENCES, enumName: 'Cadence' })
  cadence!: Cadence;

  @ApiProperty({ type: 'integer', nullable: true })
  cadenceMonth!: number | null;

  @ApiProperty({ type: 'string', format: 'date', nullable: true })
  cadenceDate!: string | null;

  @ApiProperty({ enum: ANCHORS, enumName: 'Anchor' })
  anchor!: Anchor;

  @ApiProperty({ type: 'string', nullable: true, example: '185.00' })
  amount!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: null })
  percent!: string | null;

  @ApiProperty({ enum: PERCENT_BASES, enumName: 'PercentBase' })
  percentBase!: PercentBase;

  @ApiProperty()
  rollover!: boolean;

  @ApiProperty({ enum: RESET_CYCLES, enumName: 'ResetCycle', nullable: true })
  resetCycle!: ResetCycle | null;

  @ApiProperty({ enum: RESET_ACTIONS, enumName: 'ResetAction', nullable: true })
  onReset!: ResetAction | null;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true })
  carryToItemId!: string | null;

  @ApiProperty({ type: PlanOverrideDto, isArray: true })
  overrides!: PlanOverrideDto[];
}

export class PlanVersionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: 'string', example: '2026-10' })
  effectiveFromMonth!: string;

  @ApiProperty({ type: 'string', nullable: true })
  note!: string | null;

  @ApiProperty({ description: 'Only the newest version can be changed (ADR 0018).' })
  editable!: boolean;

  @ApiProperty({ type: PlanItemDto, isArray: true })
  items!: PlanItemDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class PlanVersionSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: 'string', example: '2026-10' })
  effectiveFromMonth!: string;

  @ApiProperty({ type: 'string', nullable: true })
  note!: string | null;

  @ApiProperty()
  editable!: boolean;

  @ApiProperty()
  itemCount!: number;
}

export class ActivePlanQuery {
  @IsYearMonth()
  month!: string;
}
