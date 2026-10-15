import { Injectable } from '@nestjs/common';
import type { Currency, IsoWeekday } from '@selah/shared-types';
import { toAccountFields } from '../finance/accounts/accounts.service';
import { AccountsRepository } from '../finance/accounts/accounts.repository';
import { toBudgetTransferDto } from '../finance/budget-transfers/budget-transfers.service';
import { BudgetTransfersRepository } from '../finance/budget-transfers/budget-transfers.repository';
import { toCategoryDto } from '../finance/categories/categories.service';
import { CategoriesRepository } from '../finance/categories/categories.repository';
import { toVersionFields } from '../finance/plan/plan.service';
import { PlanRepository } from '../finance/plan/plan.repository';
import { toRecordDto } from '../finance/records/records.service';
import { RecordsRepository } from '../finance/records/records.repository';
import { SettingsRepository } from '../core/settings/settings.repository';
import type { SyncChangesDto } from './sync.dto';
import { SyncRepository } from './sync.repository';

/**
 * How far before the cursor a pull reads (ADR 0028). `updated_at` is the
 * start of the writing transaction, so a write that started before a pull
 * and committed after it has an older timestamp than the pull's cursor.
 */
export const CURSOR_OVERLAP_MS = 60_000;

const deletedAt = (row: { deletedAt: Date | null }) => row.deletedAt?.toISOString() ?? null;

/** Rows changed since a cursor, for devices to pull (ADR 0028). */
@Injectable()
export class SyncService {
  constructor(
    private readonly accounts: AccountsRepository,
    private readonly categories: CategoriesRepository,
    private readonly records: RecordsRepository,
    private readonly plan: PlanRepository,
    private readonly transfers: BudgetTransfersRepository,
    private readonly settings: SettingsRepository,
    private readonly sync: SyncRepository,
  ) {}

  async changes(since: string | undefined): Promise<SyncChangesDto> {
    // Read the clock first: anything written from here on comes again next time.
    const cursor = (await this.sync.now()).toISOString();
    const after = since ? new Date(new Date(since).getTime() - CURSOR_OVERLAP_MS) : null;
    const [accounts, categories, records, versions, transfers, settings] = await Promise.all([
      this.accounts.changedSince(after),
      this.categories.changedSince(after),
      this.records.changedSince(after),
      this.plan.changedSince(after),
      this.transfers.changedSince(after),
      this.settings.changedSince(after),
    ]);
    return {
      cursor,
      accounts: accounts.map((row) => ({ ...toAccountFields(row), deletedAt: deletedAt(row) })),
      categories: categories.map((row) => ({ ...toCategoryDto(row), deletedAt: deletedAt(row) })),
      records: records.map((found) => ({ ...toRecordDto(found), deletedAt: deletedAt(found.record) })),
      planVersions: versions.map((doc) => ({ ...toVersionFields(doc), deletedAt: deletedAt(doc.version) })),
      budgetTransfers: transfers.map((row) => ({ ...toBudgetTransferDto(row), deletedAt: deletedAt(row) })),
      settings: settings
        ? {
            weekStartDay: settings.weekStartDay as IsoWeekday,
            defaultCurrency: settings.defaultCurrency as Currency,
            updatedAt: settings.updatedAt.toISOString(),
          }
        : null,
    };
  }
}
