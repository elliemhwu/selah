import { Inject, Injectable } from '@nestjs/common';
import type { IsoWeekday } from '@selah/shared-types';
import { DATABASE } from '../../database/database.module';
import type { Database } from '../../database/database';

export interface ReportLine {
  budgetItemId: string | null;
  occurredOn: string;
  type: 'income' | 'expense';
  twdAmount: string;
}

@Injectable()
export class ReportsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** The week start day setting; Monday when no settings row exists yet. */
  async weekStartDay(): Promise<IsoWeekday> {
    const row = await this.db
      .selectFrom('core.settings')
      .select('weekStartDay')
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    return (row?.weekStartDay ?? 1) as IsoWeekday;
  }

  /** Live income and expense lines in a date range. Reports total lines, not records. */
  async lines(from: string | undefined, to: string): Promise<ReportLine[]> {
    let query = this.db
      .selectFrom('finance.recordLines as l')
      .innerJoin('finance.records as r', 'r.id', 'l.recordId')
      .select(['l.budgetItemId', 'r.occurredOn', 'r.type', 'l.twdAmount'])
      .where('l.deletedAt', 'is', null)
      .where('r.deletedAt', 'is', null)
      .where('r.type', 'in', ['income', 'expense'])
      .where('r.occurredOn', '<=', to);
    if (from) query = query.where('r.occurredOn', '>=', from);
    const rows = await query.execute();
    return rows.map((row) => ({ ...row, type: row.type as ReportLine['type'] }));
  }
}
