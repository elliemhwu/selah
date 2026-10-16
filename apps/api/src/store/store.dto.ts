import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { SettingsRowDto } from '../core/settings-row';
import { AccountRowDto } from '../finance/rows/accounts';
import { BudgetTransferRowDto } from '../finance/rows/budget-transfers';
import { CategoryRowDto } from '../finance/rows/categories';
import { PlanVersionRowDto } from '../finance/rows/plan-versions';
import { RecordRowDto } from '../finance/rows/records';

// The whole store, and a set of row changes (ADR 0029). The shapes match the
// app's DeviceSnapshot and DeviceChanges, so the API build stores exactly
// what the device build keeps in IndexedDB.

/** A list of one table's rows; optional in a set of changes. */
function Rows(type: () => new () => object, required: boolean) {
  return applyDecorators(
    ...(required
      ? [ApiProperty({ type: type(), isArray: true })]
      : [ApiPropertyOptional({ type: type(), isArray: true }), IsOptional()]),
    IsArray(),
    ValidateNested({ each: true }),
    Type(type),
  );
}

/** Everything in the store, deleted rows included. */
export class StoreSnapshotDto {
  @Rows(() => AccountRowDto, true)
  accounts!: AccountRowDto[];

  @Rows(() => CategoryRowDto, true)
  categories!: CategoryRowDto[];

  @Rows(() => RecordRowDto, true)
  records!: RecordRowDto[];

  @Rows(() => PlanVersionRowDto, true)
  planVersions!: PlanVersionRowDto[];

  @Rows(() => BudgetTransferRowDto, true)
  budgetTransfers!: BudgetTransferRowDto[];

  @ApiProperty({ type: SettingsRowDto, nullable: true, description: 'Null until the settings are first saved.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SettingsRowDto)
  settings!: SettingsRowDto | null;
}

/** Rows to create or replace, by table; saved together or not at all. */
export class StoreChangesDto {
  @Rows(() => AccountRowDto, false)
  accounts?: AccountRowDto[];

  @Rows(() => CategoryRowDto, false)
  categories?: CategoryRowDto[];

  @Rows(() => RecordRowDto, false)
  records?: RecordRowDto[];

  @Rows(() => PlanVersionRowDto, false)
  planVersions?: PlanVersionRowDto[];

  @Rows(() => BudgetTransferRowDto, false)
  budgetTransfers?: BudgetTransferRowDto[];

  @ApiPropertyOptional({ type: SettingsRowDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SettingsRowDto)
  settings?: SettingsRowDto;
}
