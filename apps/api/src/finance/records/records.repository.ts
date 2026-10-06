import { Inject, Injectable } from '@nestjs/common';
import type { Currency, RecordType } from '@selah/shared-types';
import { parseMoney, type RecordForBalance } from '@selah/shared-utils';
import { DATABASE } from '../../database/database.module';
import type { Database } from '../../database/database';

@Injectable()
export class RecordsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Live records with their live lines, shaped for `accountBalance()`. */
  async listForBalances(accountId?: string): Promise<RecordForBalance[]> {
    let query = this.db
      .selectFrom('finance.records')
      .select([
        'id',
        'type',
        'occurredOn',
        'occurredAt',
        'createdAt',
        'accountId',
        'currency',
        'counterAccountId',
        'counterAmount',
        'targetBalance',
      ])
      .where('deletedAt', 'is', null);
    if (accountId) {
      query = query.where((eb) =>
        eb.or([eb('accountId', '=', accountId), eb('counterAccountId', '=', accountId)]),
      );
    }
    const records = await query.execute();
    if (records.length === 0) return [];

    const lines = await this.db
      .selectFrom('finance.recordLines')
      .select(['recordId', 'amount', 'twdAmount'])
      .where('deletedAt', 'is', null)
      .where(
        'recordId',
        'in',
        records.map((r) => r.id),
      )
      .execute();
    const linesByRecord = new Map<string, { amount: bigint; twdAmount: bigint }[]>();
    for (const line of lines) {
      const list = linesByRecord.get(line.recordId) ?? [];
      list.push({ amount: parseMoney(line.amount), twdAmount: parseMoney(line.twdAmount) });
      linesByRecord.set(line.recordId, list);
    }

    return records.map((r) => ({
      id: r.id,
      type: r.type as RecordType,
      occurredOn: r.occurredOn,
      occurredAt: r.occurredAt,
      createdAt: r.createdAt.toISOString(),
      accountId: r.accountId,
      currency: r.currency as Currency,
      counterAccountId: r.counterAccountId,
      counterAmount: r.counterAmount === null ? null : parseMoney(r.counterAmount),
      targetBalance: r.targetBalance === null ? null : parseMoney(r.targetBalance),
      lines: linesByRecord.get(r.id) ?? [],
    }));
  }

  async accountHasLiveRecords(accountId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('finance.records')
      .select('id')
      .where('deletedAt', 'is', null)
      .where((eb) => eb.or([eb('accountId', '=', accountId), eb('counterAccountId', '=', accountId)]))
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  }
}
