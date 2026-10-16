import { Injectable } from '@nestjs/common';
import { assertAccountDeletable, balanceOf, prepareAccount } from '@selah/finance-core';
import type { AccountType, Currency } from '@selah/shared-types';
import type { RecordForBalance } from '@selah/shared-utils';
import { NotFoundError } from '../../common/errors';
import { RecordsRepository } from '../records/records.repository';
import type { AccountDto, UpsertAccountDto } from './accounts.dto';
import { type AccountRow, AccountsRepository } from './accounts.repository';

/** Accounts with derived balances; the rules are in finance-core (ADR 0025). */
@Injectable()
export class AccountsService {
  constructor(
    private readonly accounts: AccountsRepository,
    private readonly records: RecordsRepository,
  ) {}

  async list(): Promise<AccountDto[]> {
    const [rows, records] = await Promise.all([this.accounts.listLive(), this.records.listForBalances()]);
    return rows.map((row) => toDto(row, records));
  }

  async get(id: string): Promise<AccountDto> {
    const row = await this.accounts.findById(id);
    if (!row || row.deletedAt) throw new NotFoundError(`Account ${id} not found.`);
    return toDto(row, await this.records.listForBalances(id));
  }

  /** Creates or replaces an account (ADR 0017). */
  async upsert(id: string, input: UpsertAccountDto): Promise<{ account: AccountDto; created: boolean }> {
    const existing = await this.accounts.findById(id);
    const hasRecords = !!existing && (await this.records.accountHasLiveRecords(id));
    const values = prepareAccount(
      id,
      input,
      { existing: existing && { currency: existing.currency as Currency, deletedAt: existing.deletedAt }, hasRecords },
    );
    if (existing) await this.accounts.update(id, values);
    else await this.accounts.insert(id, values);
    return { account: await this.get(id), created: !existing };
  }

  /** Soft-deletes an account that has no records (ADR 0017). */
  async remove(id: string): Promise<void> {
    const existing = await this.accounts.findById(id);
    if (!existing) throw new NotFoundError(`Account ${id} not found.`);
    if (existing.deletedAt) return;
    assertAccountDeletable(await this.records.accountHasLiveRecords(id));
    await this.accounts.softDelete(id);
  }
}

function toDto(row: AccountRow, records: readonly RecordForBalance[]): AccountDto {
  const currency = row.currency as Currency;
  return {
    id: row.id,
    name: row.name,
    type: row.type as AccountType,
    currency,
    openingBalance: row.openingBalance,
    balance: balanceOf({ id: row.id, currency, openingBalance: row.openingBalance }, records),
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
