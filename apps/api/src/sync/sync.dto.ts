import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { CURRENCIES, type Currency, ISO_WEEKDAYS, type IsoWeekday } from '@selah/shared-types';
import { IsISO8601, IsOptional } from 'class-validator';
import { AccountDto } from '../finance/accounts/accounts.dto';
import { BudgetTransferDto } from '../finance/budget-transfers/budget-transfers.dto';
import { CategoryDto } from '../finance/categories/categories.dto';
import { PlanVersionDto } from '../finance/plan/plan.dto';
import { RecordDto } from '../finance/records/records.dto';

// Rows as the device stores them (ADR 0026, 0028): the API's shapes without
// derived values, plus `deletedAt` so deletions reach the device.

const DELETED_AT = {
  type: 'string',
  format: 'date-time',
  nullable: true,
  description: 'Set when the row was deleted (ADR 0007).',
} as const;

export class SyncAccountDto extends OmitType(AccountDto, ['balance'] as const) {
  @ApiProperty(DELETED_AT)
  deletedAt!: string | null;
}

export class SyncCategoryDto extends CategoryDto {
  @ApiProperty(DELETED_AT)
  deletedAt!: string | null;
}

export class SyncRecordDto extends RecordDto {
  @ApiProperty(DELETED_AT)
  deletedAt!: string | null;
}

export class SyncPlanVersionDto extends OmitType(PlanVersionDto, ['editable'] as const) {
  @ApiProperty(DELETED_AT)
  deletedAt!: string | null;
}

export class SyncBudgetTransferDto extends BudgetTransferDto {
  @ApiProperty(DELETED_AT)
  deletedAt!: string | null;
}

export class SyncSettingsDto {
  @ApiProperty({ type: 'integer', enum: [...ISO_WEEKDAYS], description: 'ISO day of week: 1 = Monday … 7 = Sunday.' })
  weekStartDay!: IsoWeekday;

  @ApiProperty({ enum: CURRENCIES, enumName: 'Currency' })
  defaultCurrency!: Currency;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class SyncChangesDto {
  @ApiProperty({
    format: 'date-time',
    description: 'Pass as `since` on the next pull. The server reads a little further back, so a row may come twice.',
  })
  cursor!: string;

  @ApiProperty({ type: SyncAccountDto, isArray: true })
  accounts!: SyncAccountDto[];

  @ApiProperty({ type: SyncCategoryDto, isArray: true })
  categories!: SyncCategoryDto[];

  @ApiProperty({ type: SyncRecordDto, isArray: true })
  records!: SyncRecordDto[];

  @ApiProperty({ type: SyncPlanVersionDto, isArray: true })
  planVersions!: SyncPlanVersionDto[];

  @ApiProperty({ type: SyncBudgetTransferDto, isArray: true })
  budgetTransfers!: SyncBudgetTransferDto[];

  @ApiProperty({ type: SyncSettingsDto, nullable: true, description: 'Null when unchanged or never saved.' })
  settings!: SyncSettingsDto | null;
}

export class SyncChangesQuery {
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'The cursor from the previous pull. Leave it out to get everything.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  since?: string;
}
