import { Injectable } from '@nestjs/common';
import type { AccountType, Currency } from '@selah/shared-types';
import {
  accountBalance,
  assertValidAmount,
  formatMoney,
  MoneyError,
  parseMoney,
  type RecordForBalance,
} from '@selah/shared-utils';
import { ConflictError, NotFoundError, RuleViolationError } from '../../common/errors';
import { RecordsRepository } from '../records/records.repository';
import type { AccountDto, UpsertAccountDto } from './accounts.dto';
import { type AccountRow, AccountsRepository } from './accounts.repository';

@Injectable()
export class AccountsService {
  constructor(
    private readonly accounts: AccountsRepository,
    private readonly records: RecordsRepository,
  ) {}

  async list(): Promise<AccountDto[]> {
    const [rows, records] = await Promise.all([this.accounts.listLive(), this.records.listForBalances()]);
    return rows.map((row) => this.toDto(row, records));
  }

  async get(id: string): Promise<AccountDto> {
    const row = await this.accounts.findById(id);
    if (!row || row.deletedAt) throw new NotFoundError(`Account ${id} not found.`);
    return this.toDto(row, await this.records.listForBalances(id));
  }

  /** Creates or replaces an account (ADR 0017). */
  async upsert(id: string, input: UpsertAccountDto): Promise<{ account: AccountDto; created: boolean }> {
    const openingBalance = parseMoney(input.openingBalance);
    try {
      assertValidAmount(openingBalance, input.currency);
    } catch (error) {
      if (error instanceof MoneyError) {
        throw new RuleViolationError(error.message, { openingBalance: [error.message] });
      }
      throw error;
    }

    const existing = await this.accounts.findById(id);
    if (existing?.deletedAt) throw new ConflictError(`Account ${id} was deleted.`);
    if (
      existing &&
      existing.currency !== input.currency &&
      (await this.records.accountHasLiveRecords(id))
    ) {
      const message = "The currency can't change once the account has records.";
      throw new RuleViolationError(message, { currency: [message] });
    }

    const values = {
      name: input.name.trim(),
      type: input.type,
      currency: input.currency,
      openingBalance: formatMoney(openingBalance),
      sortOrder: input.sortOrder ?? 0,
    };
    if (existing) await this.accounts.update(id, values);
    else await this.accounts.insert(id, values);
    return { account: await this.get(id), created: !existing };
  }

  /** Soft-deletes an account that has no records (ADR 0017). */
  async remove(id: string): Promise<void> {
    const existing = await this.accounts.findById(id);
    if (!existing) throw new NotFoundError(`Account ${id} not found.`);
    if (existing.deletedAt) return;
    if (await this.records.accountHasLiveRecords(id)) {
      throw new ConflictError('The account still has records. Delete or move them first.');
    }
    await this.accounts.softDelete(id);
  }

  private toDto(row: AccountRow, records: readonly RecordForBalance[]): AccountDto {
    const currency = row.currency as Currency;
    const { balance } = accountBalance(
      { id: row.id, currency, openingBalance: parseMoney(row.openingBalance) },
      records,
    );
    return {
      id: row.id,
      name: row.name,
      type: row.type as AccountType,
      currency,
      openingBalance: row.openingBalance,
      balance: formatMoney(balance),
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
