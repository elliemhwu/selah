import { Inject, Injectable } from '@nestjs/common';
import type { Selectable } from 'kysely';
import { isUniqueViolation } from '../../common/database-errors';
import { ConflictError } from '../../common/errors';
import { DATABASE } from '../../database/database.module';
import type { Database } from '../../database/database';
import type { FinanceCategories } from '../../database/db.generated';

export type CategoryRow = Selectable<FinanceCategories>;

export interface CategoryValues {
  name: string;
  parentId: string | null;
  sortOrder: number;
}

@Injectable()
export class CategoriesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  listLive(): Promise<CategoryRow[]> {
    return this.db
      .selectFrom('finance.categories')
      .selectAll()
      .where('deletedAt', 'is', null)
      .orderBy('sortOrder')
      .orderBy('name')
      .execute();
  }

  /** Includes soft-deleted rows. */
  findById(id: string): Promise<CategoryRow | undefined> {
    return this.db.selectFrom('finance.categories').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async hasLiveChildren(id: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('finance.categories')
      .select('id')
      .where('parentId', '=', id)
      .where('deletedAt', 'is', null)
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  }

  async insert(id: string, values: CategoryValues): Promise<void> {
    await this.unique(values.name, () =>
      this.db.insertInto('finance.categories').values({ id, ...values }).execute(),
    );
  }

  async update(id: string, values: CategoryValues): Promise<void> {
    await this.unique(values.name, () =>
      this.db.updateTable('finance.categories').set(values).where('id', '=', id).execute(),
    );
  }

  async softDelete(id: string): Promise<void> {
    await this.db
      .updateTable('finance.categories')
      .set({ deletedAt: new Date() })
      .where('id', '=', id)
      .where('deletedAt', 'is', null)
      .execute();
  }

  private async unique(name: string, write: () => Promise<unknown>): Promise<void> {
    try {
      await write();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(`A category named "${name}" already exists at this level.`);
      }
      throw error;
    }
  }
}
