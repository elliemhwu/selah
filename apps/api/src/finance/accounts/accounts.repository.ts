import { Inject, Injectable } from '@nestjs/common';
import type { Selectable } from 'kysely';
import { duplicateAccountName } from '@selah/finance-core';
import { isUniqueViolation } from '../../common/database-errors';
import { DATABASE } from '../../database/database.module';
import type { Database } from '../../database/database';
import type { FinanceAccounts } from '../../database/db.generated';

export type AccountRow = Selectable<FinanceAccounts>;

export interface AccountValues {
  name: string;
  type: string;
  currency: string;
  openingBalance: string;
  sortOrder: number;
}

@Injectable()
export class AccountsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  listLive(): Promise<AccountRow[]> {
    return this.db
      .selectFrom('finance.accounts')
      .selectAll()
      .where('deletedAt', 'is', null)
      .orderBy('sortOrder')
      .orderBy('name')
      .execute();
  }

  /** Rows changed after `after` (every row when null), soft-deleted ones included; for sync (ADR 0028). */
  changedSince(after: Date | null): Promise<AccountRow[]> {
    let query = this.db.selectFrom('finance.accounts').selectAll();
    if (after) query = query.where('updatedAt', '>', after);
    return query.execute();
  }

  /** Includes soft-deleted rows, so callers can tell "deleted" from "unknown". */
  findById(id: string): Promise<AccountRow | undefined> {
    return this.db.selectFrom('finance.accounts').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async insert(id: string, values: AccountValues): Promise<void> {
    await this.unique(values.name, () =>
      this.db.insertInto('finance.accounts').values({ id, ...values }).execute(),
    );
  }

  async update(id: string, values: AccountValues): Promise<void> {
    await this.unique(values.name, () =>
      this.db.updateTable('finance.accounts').set(values).where('id', '=', id).execute(),
    );
  }

  async softDelete(id: string): Promise<void> {
    await this.db
      .updateTable('finance.accounts')
      .set({ deletedAt: new Date() })
      .where('id', '=', id)
      .where('deletedAt', 'is', null)
      .execute();
  }

  private async unique(name: string, write: () => Promise<unknown>): Promise<void> {
    try {
      await write();
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicateAccountName(name);
      throw error;
    }
  }
}
