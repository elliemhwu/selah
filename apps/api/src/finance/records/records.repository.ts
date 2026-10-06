import { Inject, Injectable } from '@nestjs/common';
import type { Currency, RecordType, Section } from '@selah/shared-types';
import { parseMoney, type RecordForBalance } from '@selah/shared-utils';
import type { Selectable } from 'kysely';
import { ConflictError } from '../../common/errors';
import { DATABASE } from '../../database/database.module';
import type { Database } from '../../database/database';
import type {
  FinanceRecordLines,
  FinanceRecords,
} from '../../database/db.generated';

export type RecordRow = Selectable<FinanceRecords>;
export type LineRow = Selectable<FinanceRecordLines>;
export interface RecordWithLines {
  record: RecordRow;
  lines: LineRow[];
}

export interface LineWrite {
  id: string;
  amount: string;
  twdAmount: string;
  fxRate: string | null;
  categoryId: string | null;
  budgetItemId: string | null;
  note: string | null;
  sortOrder: number;
}

export interface RecordWrite {
  id: string;
  type: RecordType;
  occurredOn: string;
  occurredAt: string | null;
  accountId: string;
  currency: Currency;
  counterAccountId: string | null;
  counterAmount: string | null;
  targetBalance: string | null;
  note: string | null;
  lines: LineWrite[];
}

export interface RecordFilters {
  from: string;
  to: string;
  accountId?: string;
  categoryId?: string;
  budgetItemId?: string;
  type?: RecordType;
}

export interface Lookups {
  accounts: Map<string, { currency: Currency }>;
  categories: Set<string>;
  budgetItems: Map<string, { section: Section }>;
}

@Injectable()
export class RecordsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Live records in a date range, newest first, each with its live lines. */
  async list(filters: RecordFilters): Promise<RecordWithLines[]> {
    let query = this.db
      .selectFrom('finance.records as r')
      .selectAll('r')
      .where('r.deletedAt', 'is', null)
      .where('r.occurredOn', '>=', filters.from)
      .where('r.occurredOn', '<=', filters.to);
    if (filters.type) query = query.where('r.type', '=', filters.type);
    if (filters.accountId) {
      const accountId = filters.accountId;
      query = query.where((eb) =>
        eb.or([
          eb('r.accountId', '=', accountId),
          eb('r.counterAccountId', '=', accountId),
        ]),
      );
    }
    for (const column of ['categoryId', 'budgetItemId'] as const) {
      const value = filters[column];
      if (!value) continue;
      query = query.where(({ exists, selectFrom }) =>
        exists(
          selectFrom('finance.recordLines as l')
            .select('l.id')
            .whereRef('l.recordId', '=', 'r.id')
            .where('l.deletedAt', 'is', null)
            .where(`l.${column}`, '=', value),
        ),
      );
    }
    // Newest first; a record without a time counts as the end of its day (ADR 0014).
    const records = await query
      .orderBy('r.occurredOn', 'desc')
      .orderBy('r.occurredAt', (ob) => ob.desc().nullsFirst())
      .orderBy('r.createdAt', 'desc')
      .execute();
    return this.withLines(records);
  }

  /** Records by id, including soft-deleted ones. */
  async findByIds(ids: readonly string[]): Promise<RecordWithLines[]> {
    if (ids.length === 0) return [];
    const records = await this.db
      .selectFrom('finance.records')
      .selectAll()
      .where('id', 'in', ids)
      .execute();
    return this.withLines(records);
  }

  /** The live accounts, categories and budget items among the given ids. */
  async lookups(ids: {
    accounts: string[];
    categories: string[];
    budgetItems: string[];
  }): Promise<Lookups> {
    const [accounts, categories, budgetItems] = await Promise.all([
      ids.accounts.length
        ? this.db
            .selectFrom('finance.accounts')
            .select(['id', 'currency'])
            .where('id', 'in', ids.accounts)
            .where('deletedAt', 'is', null)
            .execute()
        : [],
      ids.categories.length
        ? this.db
            .selectFrom('finance.categories')
            .select('id')
            .where('id', 'in', ids.categories)
            .where('deletedAt', 'is', null)
            .execute()
        : [],
      ids.budgetItems.length
        ? this.db
            .selectFrom('finance.budgetItems')
            .select(['id', 'section'])
            .where('id', 'in', ids.budgetItems)
            .where('deletedAt', 'is', null)
            .execute()
        : [],
    ]);
    return {
      accounts: new Map(
        accounts.map((a) => [a.id, { currency: a.currency as Currency }]),
      ),
      categories: new Set(categories.map((c) => c.id)),
      budgetItems: new Map(
        budgetItems.map((b) => [b.id, { section: b.section as Section }]),
      ),
    };
  }

  /**
   * Creates or replaces records and their lines in one transaction
   * (ADR 0017). Lines keep their ids: matching ones are updated, new ones
   * inserted, missing ones soft-deleted. Returns the ids that were created.
   */
  async save(writes: readonly RecordWrite[]): Promise<Set<string>> {
    return this.db.transaction().execute(async (trx) => {
      const ids = writes.map((w) => w.id);
      const existing = await trx
        .selectFrom('finance.records')
        .select(['id', 'deletedAt'])
        .where('id', 'in', ids)
        .forUpdate()
        .execute();
      const deleted = existing.find((r) => r.deletedAt !== null);
      if (deleted) throw new ConflictError(`Record ${deleted.id} was deleted.`);
      const existingIds = new Set(existing.map((r) => r.id));

      const lineOwner = new Map(
        writes.flatMap((w) => w.lines.map((l) => [l.id, w.id] as const)),
      );
      if (lineOwner.size) {
        const taken = await trx
          .selectFrom('finance.recordLines')
          .select(['id', 'recordId'])
          .where('id', 'in', [...lineOwner.keys()])
          .execute();
        const stolen = taken.find(
          (line) => line.recordId !== lineOwner.get(line.id),
        );
        if (stolen)
          throw new ConflictError(
            `Line ${stolen.id} belongs to another record.`,
          );
      }

      const now = new Date();
      for (const { lines, ...record } of writes) {
        if (existingIds.has(record.id)) {
          await trx
            .updateTable('finance.records')
            .set(record)
            .where('id', '=', record.id)
            .execute();
        } else {
          await trx.insertInto('finance.records').values(record).execute();
        }

        const current = await trx
          .selectFrom('finance.recordLines')
          .select('id')
          .where('recordId', '=', record.id)
          .execute();
        const currentIds = new Set(current.map((l) => l.id));
        const keep = new Set(lines.map((l) => l.id));
        const removed = [...currentIds].filter((id) => !keep.has(id));
        if (removed.length) {
          await trx
            .updateTable('finance.recordLines')
            .set({ deletedAt: now })
            .where('id', 'in', removed)
            .where('deletedAt', 'is', null)
            .execute();
        }
        for (const line of lines) {
          if (currentIds.has(line.id)) {
            await trx
              .updateTable('finance.recordLines')
              .set({ ...line, deletedAt: null })
              .where('id', '=', line.id)
              .execute();
          } else {
            await trx
              .insertInto('finance.recordLines')
              .values({ ...line, recordId: record.id })
              .execute();
          }
        }
      }
      return new Set(ids.filter((id) => !existingIds.has(id)));
    });
  }

  /** Soft-deletes a record and its lines. */
  async softDelete(id: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const now = new Date();
      await trx
        .updateTable('finance.recordLines')
        .set({ deletedAt: now })
        .where('recordId', '=', id)
        .where('deletedAt', 'is', null)
        .execute();
      await trx
        .updateTable('finance.records')
        .set({ deletedAt: now })
        .where('id', '=', id)
        .where('deletedAt', 'is', null)
        .execute();
    });
  }

  /** The most recent rate used per foreign currency. */
  async lastUsedRates(): Promise<
    { currency: Currency; rate: string; occurredOn: string }[]
  > {
    const rows = await this.db
      .selectFrom('finance.recordLines as l')
      .innerJoin('finance.records as r', 'r.id', 'l.recordId')
      .distinctOn('r.currency')
      .select(['r.currency', 'l.fxRate', 'r.occurredOn'])
      .where('l.deletedAt', 'is', null)
      .where('r.deletedAt', 'is', null)
      .where('l.fxRate', 'is not', null)
      .orderBy('r.currency')
      .orderBy('r.occurredOn', 'desc')
      .orderBy('r.occurredAt', (ob) => ob.desc().nullsFirst())
      .orderBy('r.createdAt', 'desc')
      .execute();
    return rows.map((row) => ({
      currency: row.currency as Currency,
      rate: row.fxRate as string,
      occurredOn: row.occurredOn,
    }));
  }

  /** Live records with their live lines, shaped for `accountBalance()`. */
  async listForBalances(accountId?: string): Promise<RecordForBalance[]> {
    let query = this.db
      .selectFrom('finance.records')
      .selectAll()
      .where('deletedAt', 'is', null);
    if (accountId) {
      query = query.where((eb) =>
        eb.or([
          eb('accountId', '=', accountId),
          eb('counterAccountId', '=', accountId),
        ]),
      );
    }
    const records = await this.withLines(await query.execute());
    return records.map(({ record: r, lines }) => ({
      id: r.id,
      type: r.type as RecordType,
      occurredOn: r.occurredOn,
      occurredAt: r.occurredAt,
      createdAt: r.createdAt.toISOString(),
      accountId: r.accountId,
      currency: r.currency as Currency,
      counterAccountId: r.counterAccountId,
      counterAmount:
        r.counterAmount === null ? null : parseMoney(r.counterAmount),
      targetBalance:
        r.targetBalance === null ? null : parseMoney(r.targetBalance),
      lines: lines.map((l) => ({
        amount: parseMoney(l.amount),
        twdAmount: parseMoney(l.twdAmount),
      })),
    }));
  }

  async accountHasLiveRecords(accountId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('finance.records')
      .select('id')
      .where('deletedAt', 'is', null)
      .where((eb) =>
        eb.or([
          eb('accountId', '=', accountId),
          eb('counterAccountId', '=', accountId),
        ]),
      )
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  }

  /** Attaches each record's live lines, in line order. */
  private async withLines(records: RecordRow[]): Promise<RecordWithLines[]> {
    if (records.length === 0) return [];
    const lines = await this.db
      .selectFrom('finance.recordLines')
      .selectAll()
      .where(
        'recordId',
        'in',
        records.map((r) => r.id),
      )
      .where('deletedAt', 'is', null)
      .orderBy('sortOrder')
      .execute();
    const byRecord = new Map<string, LineRow[]>();
    for (const line of lines) {
      const list = byRecord.get(line.recordId) ?? [];
      list.push(line);
      byRecord.set(line.recordId, list);
    }
    return records.map((record) => ({
      record,
      lines: byRecord.get(record.id) ?? [],
    }));
  }
}
