import { Inject, Injectable } from '@nestjs/common';
import { settingsTable } from '../core/settings-row';
import { toStoreError } from '../common/database-errors';
import { DATABASE } from '../database/database.module';
import type { Database } from '../database/database';
import { accountsTable } from '../finance/rows/accounts';
import { budgetTransfersTable } from '../finance/rows/budget-transfers';
import { categoriesTable } from '../finance/rows/categories';
import { planVersionsTable } from '../finance/rows/plan-versions';
import { recordsTable } from '../finance/rows/records';
import type { StoreChangesDto, StoreSnapshotDto } from './store.dto';

/**
 * The generic row store (ADR 0029). It stores what the app sends: the app
 * runs the finance-core rules before saving, in both builds. The database
 * still enforces its own constraints.
 */
@Injectable()
export class StoreService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Every row, read in one consistent snapshot. */
  load(): Promise<StoreSnapshotDto> {
    return this.db
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute(async (trx) => ({
        accounts: await accountsTable.load(trx),
        categories: await categoriesTable.load(trx),
        records: await recordsTable.load(trx),
        planVersions: await planVersionsTable.load(trx),
        budgetTransfers: await budgetTransfersTable.load(trx),
        settings: await settingsTable.load(trx),
      }));
  }

  /** Creates or replaces the rows, all or nothing. */
  async save(changes: StoreChangesDto): Promise<void> {
    await this.write((trx) => saveAll(trx, changes));
  }

  /** Replaces everything, such as when restoring a backup. */
  async replace(snapshot: StoreSnapshotDto): Promise<void> {
    await this.write(async (trx) => {
      // Rows that refer to others go first.
      await budgetTransfersTable.clear(trx);
      await recordsTable.clear(trx);
      await planVersionsTable.clear(trx);
      await categoriesTable.clear(trx);
      await accountsTable.clear(trx);
      await settingsTable.clear(trx);
      await saveAll(trx, { ...snapshot, settings: snapshot.settings ?? undefined });
    });
  }

  private async write(work: (trx: Database) => Promise<void>): Promise<void> {
    try {
      await this.db.transaction().execute(work);
    } catch (error) {
      throw toStoreError(error);
    }
  }
}

/**
 * Saves in foreign-key order: a row refers only to tables saved before it.
 * Plan versions create the budget items that records and transfers use.
 */
async function saveAll(trx: Database, changes: StoreChangesDto): Promise<void> {
  await accountsTable.save(trx, changes.accounts ?? []);
  await categoriesTable.save(trx, changes.categories ?? []);
  await planVersionsTable.save(trx, changes.planVersions ?? []);
  await recordsTable.save(trx, changes.records ?? []);
  await budgetTransfersTable.save(trx, changes.budgetTransfers ?? []);
  if (changes.settings) await settingsTable.save(trx, changes.settings);
}
