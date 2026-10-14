import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BUDGET_TRANSFER_KINDS,
  type BudgetTransferKind,
  CADENCES,
  type Cadence,
  RESET_ACTIONS,
  RESET_CYCLES,
  type ResetAction,
  type ResetCycle,
  SECTIONS,
  type Section,
} from '@selah/shared-types';
import { IsOptional, IsUUID } from 'class-validator';
import { IsLocalDate, IsYearMonth } from '../../common/validation';

// Reports are calculated on read from records, plan versions and transfers
// (ADR 0011, 0019). Money is whole TWD as a decimal string.

// ---- Queries -------------------------------------------------------------

export class AsOfDateQuery {
  @IsLocalDate({ description: 'The day to report on, usually today.' })
  date!: string;
}

export class MonthQuery {
  @IsYearMonth()
  month!: string;
}

export class BudgetTransfersReportQuery {
  @IsLocalDate({ description: 'First day, inclusive.' })
  from!: string;

  @IsLocalDate({ description: 'Last day, inclusive.' })
  to!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Transfers from or to this item.' })
  @IsOptional()
  @IsUUID('all')
  budgetItemId?: string;
}

// ---- Shared --------------------------------------------------------------

export class PeriodDto {
  @ApiProperty({ type: 'string', format: 'date', example: '2026-10-05' })
  start!: string;

  @ApiProperty({ type: 'string', format: 'date', example: '2026-10-11' })
  end!: string;
}

/** The item fields every report repeats, from the version active in the report's month. */
class ReportItemDto {
  @ApiProperty({ format: 'uuid' })
  budgetItemId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: SECTIONS, enumName: 'Section' })
  section!: Section;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true })
  parentItemId!: string | null;

  @ApiProperty({ enum: CADENCES, enumName: 'Cadence' })
  cadence!: Cadence;
}

// ---- Envelopes -----------------------------------------------------------

export class EnvelopeDto extends ReportItemDto {
  @ApiProperty({ enum: RESET_CYCLES, enumName: 'ResetCycle' })
  resetCycle!: ResetCycle;

  @ApiProperty({ enum: RESET_ACTIONS, enumName: 'ResetAction', nullable: true })
  onReset!: ResetAction | null;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true })
  carryToItemId!: string | null;

  @ApiProperty({ type: 'string', format: 'date', description: 'When this envelope started (ADR 0019).' })
  envelopeStart!: string;

  @ApiProperty({ type: 'string', format: 'date', nullable: true, description: 'The end of the current reset cycle; null if it never resets.' })
  resetsOn!: string | null;

  @ApiProperty({ type: PeriodDto, description: 'The current cadence period.' })
  period!: PeriodDto;

  @ApiProperty({ type: 'string', example: '185.00', description: "The current period's allotment." })
  allotment!: string;

  @ApiProperty({ type: 'string', example: '35.00', description: 'Carried in from earlier periods (negative = overspent).' })
  carryIn!: string;

  @ApiProperty({ type: 'string', example: '0.00', description: 'Net budget transfers in this period, resets carried in included.' })
  transfers!: string;

  @ApiProperty({ type: 'string', example: '0.00', description: 'Spent in this period, up to the report date.' })
  spent!: string;

  @ApiProperty({ type: 'string', example: '220.00', description: 'What is left now (negative = overspent).' })
  available!: string;
}

// ---- Checklist -----------------------------------------------------------

export class ChecklistItemDto extends ReportItemDto {
  @ApiProperty({ type: PeriodDto })
  period!: PeriodDto;

  @ApiProperty({ type: 'string', example: '1200.00', description: 'Planned for the period; pre-fills batch entry.' })
  planned!: string;

  @ApiProperty({ type: 'string', example: '0.00', description: 'Recorded in the period, on the item and its descendants.' })
  recorded!: string;

  @ApiProperty({ type: 'integer', description: 'Record lines behind `recorded`.' })
  lineCount!: number;

  @ApiProperty({ description: 'True once any line is recorded.' })
  done!: boolean;
}

// ---- Monthly review ------------------------------------------------------

export class PlanBasesDto {
  @ApiProperty({ type: 'string', example: '60000.00' })
  grossIncome!: string;

  @ApiProperty({ type: 'string', example: '3000.00' })
  government!: string;

  @ApiProperty({ type: 'string', example: '57000.00', description: 'Gross income minus Government: the default base.' })
  netIncome!: string;
}

export class PlanActualDto {
  @ApiProperty({ type: 'string', description: 'Planned for the month.' })
  planned!: string;

  @ApiProperty({ type: 'string', description: 'Net budget transfers in the month, computed resets included.' })
  transfers!: string;

  @ApiProperty({ type: 'string', description: 'Received (income) or spent (other sections).' })
  actual!: string;

  @ApiProperty({ type: 'string', description: 'planned + transfers − actual.' })
  remaining!: string;
}

export class SectionReviewDto extends PlanActualDto {
  @ApiProperty({ enum: SECTIONS, enumName: 'Section' })
  section!: Section;
}

export class YearToDateDto {
  @ApiProperty({ type: 'string', description: 'Planned for the whole year, across versions.' })
  planned!: string;

  @ApiProperty({ type: 'string', description: 'Actual from January to the end of this month.' })
  actual!: string;
}

export class ItemReviewDto extends PlanActualDto {
  @ApiProperty({ format: 'uuid' })
  budgetItemId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: SECTIONS, enumName: 'Section' })
  section!: Section;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true })
  parentItemId!: string | null;

  @ApiProperty({ enum: CADENCES, enumName: 'Cadence' })
  cadence!: Cadence;

  @ApiProperty({ type: YearToDateDto, nullable: true, description: 'Yearly and one-time items only.' })
  year!: YearToDateDto | null;
}

export class UnplannedDto {
  @ApiProperty({ type: 'string', description: 'Income on no item, or on an item outside this version.' })
  income!: string;

  @ApiProperty({ type: 'string', description: 'Spending on no item, or on an item outside this version.' })
  expense!: string;
}

export class MonthlyReviewDto {
  @ApiProperty({ type: 'string', example: '2026-10' })
  month!: string;

  @ApiProperty({ format: 'uuid' })
  planVersionId!: string;

  @ApiProperty({ type: PlanBasesDto })
  bases!: PlanBasesDto;

  @ApiProperty({ type: SectionReviewDto, isArray: true, description: 'Totals of the top-level items, in section order.' })
  sections!: SectionReviewDto[];

  @ApiProperty({
    type: ItemReviewDto,
    isArray: true,
    description: "In plan order. A parent's transfers and actual include its descendants'.",
  })
  items!: ItemReviewDto[];

  @ApiProperty({ type: UnplannedDto })
  unplanned!: UnplannedDto;
}

// ---- Budget transfers with resets ------------------------------------------

export class BudgetMovementDto {
  @ApiProperty({ enum: BUDGET_TRANSFER_KINDS, enumName: 'BudgetTransferKind' })
  kind!: BudgetTransferKind;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true, description: 'Null for a computed reset.' })
  id!: string | null;

  @ApiProperty({ type: 'string', format: 'date' })
  occurredOn!: string;

  @ApiProperty({ type: 'string', nullable: true, example: null })
  occurredAt!: string | null;

  @ApiProperty({ format: 'uuid' })
  fromItemId!: string;

  @ApiProperty({ type: 'string', format: 'uuid', nullable: true, description: 'Null when a reset drops the leftover.' })
  toItemId!: string | null;

  @ApiProperty({ type: 'string', example: '620.00', description: 'Negative for a reset that carries an overspend.' })
  amount!: string;

  @ApiProperty({ type: 'string', nullable: true })
  note!: string | null;
}
