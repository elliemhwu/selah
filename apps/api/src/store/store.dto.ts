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
import { CommentRowDto } from '../journal/rows/comments';
import { GodNoteRowDto } from '../journal/rows/god-notes';
import { JournalRowDto } from '../journal/rows/journals';
import { MomentRowDto } from '../journal/rows/moments';
import { AreaRowDto } from '../planner/rows/areas';
import { ChangeLogRowDto } from '../planner/rows/change-log';
import { ProjectGroupRowDto } from '../planner/rows/project-groups';
import { ProjectRowDto } from '../planner/rows/projects';
import { SessionItemRowDto } from '../planner/rows/session-items';
import { SessionRowDto } from '../planner/rows/sessions';
import { TaskRecordRowDto } from '../planner/rows/task-records';
import { TaskRowDto } from '../planner/rows/tasks';

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

  @Rows(() => MomentRowDto, true)
  moments!: MomentRowDto[];

  @Rows(() => JournalRowDto, true)
  journals!: JournalRowDto[];

  @Rows(() => CommentRowDto, true)
  comments!: CommentRowDto[];

  @Rows(() => GodNoteRowDto, true)
  godNotes!: GodNoteRowDto[];

  @Rows(() => AreaRowDto, true)
  areas!: AreaRowDto[];

  @Rows(() => ProjectGroupRowDto, true)
  projectGroups!: ProjectGroupRowDto[];

  @Rows(() => ProjectRowDto, true)
  projects!: ProjectRowDto[];

  @Rows(() => TaskRowDto, true)
  tasks!: TaskRowDto[];

  @Rows(() => TaskRecordRowDto, true)
  taskRecords!: TaskRecordRowDto[];

  @Rows(() => SessionRowDto, true)
  sessions!: SessionRowDto[];

  @Rows(() => SessionItemRowDto, true)
  sessionItems!: SessionItemRowDto[];

  @Rows(() => ChangeLogRowDto, true)
  changeLog!: ChangeLogRowDto[];

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

  @Rows(() => MomentRowDto, false)
  moments?: MomentRowDto[];

  @Rows(() => JournalRowDto, false)
  journals?: JournalRowDto[];

  @Rows(() => CommentRowDto, false)
  comments?: CommentRowDto[];

  @Rows(() => GodNoteRowDto, false)
  godNotes?: GodNoteRowDto[];

  @Rows(() => AreaRowDto, false)
  areas?: AreaRowDto[];

  @Rows(() => ProjectGroupRowDto, false)
  projectGroups?: ProjectGroupRowDto[];

  @Rows(() => ProjectRowDto, false)
  projects?: ProjectRowDto[];

  @Rows(() => TaskRowDto, false)
  tasks?: TaskRowDto[];

  @Rows(() => TaskRecordRowDto, false)
  taskRecords?: TaskRecordRowDto[];

  @Rows(() => SessionRowDto, false)
  sessions?: SessionRowDto[];

  @Rows(() => SessionItemRowDto, false)
  sessionItems?: SessionItemRowDto[];

  @Rows(() => ChangeLogRowDto, false)
  changeLog?: ChangeLogRowDto[];

  @ApiPropertyOptional({ type: SettingsRowDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SettingsRowDto)
  settings?: SettingsRowDto;
}
