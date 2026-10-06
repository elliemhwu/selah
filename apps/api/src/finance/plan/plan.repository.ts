import { Inject, Injectable } from '@nestjs/common';
import type { Cadence, ResetAction, ResetCycle, Section } from '@selah/shared-types';
import type { Selectable } from 'kysely';
import { DATABASE } from '../../database/database.module';
import type { Database } from '../../database/database';
import type { FinanceBudgetPlanVersions } from '../../database/db.generated';
import type { Anchor, PercentBase } from './plan.dto';

export type VersionRow = Selectable<FinanceBudgetPlanVersions>;

export interface ItemData {
  budgetItemId: string;
  section: Section;
  name: string;
  parentItemId: string | null;
  cadence: Cadence;
  cadenceMonth: number | null;
  cadenceDate: string | null;
  anchor: Anchor;
  amount: string | null;
  percent: string | null;
  percentBase: PercentBase;
  rollover: boolean;
  resetCycle: ResetCycle | null;
  onReset: ResetAction | null;
  carryToItemId: string | null;
  /** Months as first-of-month dates, 'YYYY-MM-01'. */
  overrides: { month: string; amount: string }[];
}

export interface VersionWrite {
  id: string;
  /** First-of-month date, 'YYYY-MM-01'. */
  effectiveFromMonth: string;
  note: string | null;
  items: ItemData[];
}

export interface VersionDocument {
  version: VersionRow;
  items: ItemData[];
}

@Injectable()
export class PlanRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Live versions, oldest first, with their item counts. */
  listVersions(): Promise<(VersionRow & { itemCount: number })[]> {
    return this.db
      .selectFrom('finance.budgetPlanVersions as v')
      .selectAll('v')
      .select((eb) =>
        eb
          .selectFrom('finance.budgetItemVersions as iv')
          .select((e) => e.fn.countAll<number>().as('n'))
          .whereRef('iv.planVersionId', '=', 'v.id')
          .where('iv.deletedAt', 'is', null)
          .as('itemCount'),
      )
      .where('v.deletedAt', 'is', null)
      .orderBy('v.effectiveFromMonth')
      .execute()
      .then((rows) => rows.map((r) => ({ ...r, itemCount: Number(r.itemCount ?? 0) })));
  }

  /** Includes soft-deleted versions. */
  findVersion(id: string): Promise<VersionRow | undefined> {
    return this.db.selectFrom('finance.budgetPlanVersions').selectAll().where('id', '=', id).executeTakeFirst();
  }

  /** The newest live version, optionally ignoring one. */
  newestVersion(exceptId?: string): Promise<VersionRow | undefined> {
    let query = this.db
      .selectFrom('finance.budgetPlanVersions')
      .selectAll()
      .where('deletedAt', 'is', null);
    if (exceptId) query = query.where('id', '!=', exceptId);
    return query.orderBy('effectiveFromMonth', 'desc').limit(1).executeTakeFirst();
  }

  /** The live version in effect for a first-of-month date. */
  activeVersion(monthStart: string): Promise<VersionRow | undefined> {
    return this.db
      .selectFrom('finance.budgetPlanVersions')
      .selectAll()
      .where('deletedAt', 'is', null)
      .where('effectiveFromMonth', '<=', monthStart)
      .orderBy('effectiveFromMonth', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  /** Sections of existing stable items, to keep them fixed. */
  async itemSections(ids: readonly string[]): Promise<Map<string, Section>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .selectFrom('finance.budgetItems')
      .select(['id', 'section'])
      .where('id', 'in', ids)
      .execute();
    return new Map(rows.map((r) => [r.id, r.section as Section]));
  }

  async loadDocument(version: VersionRow): Promise<VersionDocument> {
    const items = await this.db
      .selectFrom('finance.budgetItemVersions as iv')
      .innerJoin('finance.budgetItems as bi', 'bi.id', 'iv.budgetItemId')
      .selectAll('iv')
      .select('bi.section')
      .where('iv.planVersionId', '=', version.id)
      .where('iv.deletedAt', 'is', null)
      .orderBy('iv.sortOrder')
      .execute();
    const overrides = items.length
      ? await this.db
          .selectFrom('finance.budgetItemOverrides')
          .select(['budgetItemVersionId', 'month', 'amount'])
          .where(
            'budgetItemVersionId',
            'in',
            items.map((i) => i.id),
          )
          .where('deletedAt', 'is', null)
          .orderBy('month')
          .execute()
      : [];
    return {
      version,
      items: items.map((i) => ({
        budgetItemId: i.budgetItemId,
        section: i.section as Section,
        name: i.name,
        parentItemId: i.parentItemId,
        cadence: i.cadence as Cadence,
        cadenceMonth: i.cadenceMonth,
        cadenceDate: i.cadenceDate,
        anchor: i.anchor as Anchor,
        amount: i.amount,
        percent: i.percent,
        percentBase: i.percentBase as PercentBase,
        rollover: i.rollover,
        resetCycle: i.resetCycle as ResetCycle | null,
        onReset: i.onReset as ResetAction | null,
        carryToItemId: i.carryToItemId,
        overrides: overrides
          .filter((o) => o.budgetItemVersionId === i.id)
          .map((o) => ({ month: o.month, amount: o.amount })),
      })),
    };
  }

  /**
   * Replaces a version and all its items and overrides in one transaction
   * (ADR 0018). Item rows are matched by budgetItemId and overrides by month,
   * so unchanged rows keep their ids; anything left out is soft-deleted.
   * Returns true if the version was created.
   */
  async save(write: VersionWrite): Promise<boolean> {
    return this.db.transaction().execute(async (trx) => {
      const now = new Date();
      const existing = await trx
        .selectFrom('finance.budgetPlanVersions')
        .select('id')
        .where('id', '=', write.id)
        .forUpdate()
        .executeTakeFirst();
      const versionRow = { effectiveFromMonth: write.effectiveFromMonth, note: write.note };
      if (existing) {
        await trx.updateTable('finance.budgetPlanVersions').set(versionRow).where('id', '=', write.id).execute();
      } else {
        await trx.insertInto('finance.budgetPlanVersions').values({ id: write.id, ...versionRow }).execute();
      }

      if (write.items.length) {
        await trx
          .insertInto('finance.budgetItems')
          .values(write.items.map((i) => ({ id: i.budgetItemId, section: i.section })))
          .onConflict((oc) => oc.column('id').doNothing())
          .execute();
      }

      const current = await trx
        .selectFrom('finance.budgetItemVersions')
        .select(['id', 'budgetItemId'])
        .where('planVersionId', '=', write.id)
        .where('deletedAt', 'is', null)
        .execute();
      const currentByItem = new Map(current.map((c) => [c.budgetItemId, c.id]));
      const keep = new Set(write.items.map((i) => i.budgetItemId));
      const removed = current.filter((c) => !keep.has(c.budgetItemId)).map((c) => c.id);
      if (removed.length) {
        await trx
          .updateTable('finance.budgetItemOverrides')
          .set({ deletedAt: now })
          .where('budgetItemVersionId', 'in', removed)
          .where('deletedAt', 'is', null)
          .execute();
        await trx
          .updateTable('finance.budgetItemVersions')
          .set({ deletedAt: now })
          .where('id', 'in', removed)
          .execute();
      }

      for (const [index, { overrides, section, ...item }] of write.items.entries()) {
        const row = { ...item, sortOrder: index };
        let itemVersionId = currentByItem.get(item.budgetItemId);
        if (itemVersionId) {
          await trx.updateTable('finance.budgetItemVersions').set(row).where('id', '=', itemVersionId).execute();
        } else {
          const inserted = await trx
            .insertInto('finance.budgetItemVersions')
            .values({ ...row, planVersionId: write.id })
            .returning('id')
            .executeTakeFirstOrThrow();
          itemVersionId = inserted.id;
        }
        await this.saveOverrides(trx, itemVersionId, overrides, now);
      }

      return !existing;
    });
  }

  /** Soft-deletes a version with its items and overrides. */
  async softDeleteVersion(id: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const now = new Date();
      const itemIds = (
        await trx
          .selectFrom('finance.budgetItemVersions')
          .select('id')
          .where('planVersionId', '=', id)
          .where('deletedAt', 'is', null)
          .execute()
      ).map((r) => r.id);
      if (itemIds.length) {
        await trx
          .updateTable('finance.budgetItemOverrides')
          .set({ deletedAt: now })
          .where('budgetItemVersionId', 'in', itemIds)
          .where('deletedAt', 'is', null)
          .execute();
        await trx.updateTable('finance.budgetItemVersions').set({ deletedAt: now }).where('id', 'in', itemIds).execute();
      }
      await trx
        .updateTable('finance.budgetPlanVersions')
        .set({ deletedAt: now })
        .where('id', '=', id)
        .where('deletedAt', 'is', null)
        .execute();
    });
  }

  private async saveOverrides(
    trx: Database,
    itemVersionId: string,
    overrides: readonly { month: string; amount: string }[],
    now: Date,
  ): Promise<void> {
    const current = await trx
      .selectFrom('finance.budgetItemOverrides')
      .select(['id', 'month'])
      .where('budgetItemVersionId', '=', itemVersionId)
      .where('deletedAt', 'is', null)
      .execute();
    const byMonth = new Map(current.map((c) => [c.month, c.id]));
    const keep = new Set(overrides.map((o) => o.month));
    const removed = current.filter((c) => !keep.has(c.month)).map((c) => c.id);
    if (removed.length) {
      await trx.updateTable('finance.budgetItemOverrides').set({ deletedAt: now }).where('id', 'in', removed).execute();
    }
    for (const override of overrides) {
      const id = byMonth.get(override.month);
      if (id) {
        await trx.updateTable('finance.budgetItemOverrides').set({ amount: override.amount }).where('id', '=', id).execute();
      } else {
        await trx
          .insertInto('finance.budgetItemOverrides')
          .values({ budgetItemVersionId: itemVersionId, month: override.month, amount: override.amount })
          .execute();
      }
    }
  }
}
