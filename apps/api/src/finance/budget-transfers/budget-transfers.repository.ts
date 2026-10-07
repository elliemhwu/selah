import { Inject, Injectable } from '@nestjs/common';
import type { Section } from '@selah/shared-types';
import type { Selectable } from 'kysely';
import { DATABASE } from '../../database/database.module';
import type { Database } from '../../database/database';
import type { FinanceBudgetTransfers } from '../../database/db.generated';

export type BudgetTransferRow = Selectable<FinanceBudgetTransfers>;

export interface BudgetTransferValues {
  occurredOn: string;
  occurredAt: string | null;
  fromItemId: string;
  toItemId: string;
  amount: string;
  note: string | null;
}

export interface BudgetTransferFilters {
  from?: string;
  to: string;
  budgetItemId?: string;
  kind?: 'manual' | 'reset';
}

@Injectable()
export class BudgetTransfersRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Live transfers in a date range, in date order. */
  list(filters: BudgetTransferFilters): Promise<BudgetTransferRow[]> {
    let query = this.db
      .selectFrom('finance.budgetTransfers')
      .selectAll()
      .where('deletedAt', 'is', null)
      .where('occurredOn', '<=', filters.to);
    if (filters.from) query = query.where('occurredOn', '>=', filters.from);
    if (filters.kind) query = query.where('kind', '=', filters.kind);
    if (filters.budgetItemId) {
      const id = filters.budgetItemId;
      query = query.where((eb) => eb.or([eb('fromItemId', '=', id), eb('toItemId', '=', id)]));
    }
    // A transfer without a time counts as the end of its day (ADR 0014).
    return query
      .orderBy('occurredOn')
      .orderBy('occurredAt', (ob) => ob.asc().nullsLast())
      .orderBy('createdAt')
      .execute();
  }

  /** Includes soft-deleted rows, so callers can tell "deleted" from "unknown". */
  findById(id: string): Promise<BudgetTransferRow | undefined> {
    return this.db.selectFrom('finance.budgetTransfers').selectAll().where('id', '=', id).executeTakeFirst();
  }

  /** Sections of the live budget items among the given ids. */
  async itemSections(ids: readonly string[]): Promise<Map<string, Section>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .selectFrom('finance.budgetItems')
      .select(['id', 'section'])
      .where('id', 'in', ids)
      .where('deletedAt', 'is', null)
      .execute();
    return new Map(rows.map((r) => [r.id, r.section as Section]));
  }

  async insert(id: string, values: BudgetTransferValues): Promise<void> {
    await this.db.insertInto('finance.budgetTransfers').values({ id, kind: 'manual', ...values }).execute();
  }

  async update(id: string, values: BudgetTransferValues): Promise<void> {
    await this.db.updateTable('finance.budgetTransfers').set(values).where('id', '=', id).execute();
  }

  async softDelete(id: string): Promise<void> {
    await this.db
      .updateTable('finance.budgetTransfers')
      .set({ deletedAt: new Date() })
      .where('id', '=', id)
      .where('deletedAt', 'is', null)
      .execute();
  }
}
