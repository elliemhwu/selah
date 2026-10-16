import type { AccountType, Currency, RecordType } from '@selah/shared-types';
import {
  accountBalance,
  assertValidAmount,
  formatMoney,
  MoneyError,
  parseMoney,
  type RecordForBalance,
} from '@selah/shared-utils';
import { ConflictError, RuleViolationError } from './errors';

// Accounts with derived balances (requirements §1, ADR 0011).

export interface AccountInput {
  name: string;
  type: AccountType;
  currency: Currency;
  openingBalance: string;
  sortOrder?: number;
}

/** An account checked and normalised, ready to store. */
export interface AccountValues {
  name: string;
  type: AccountType;
  currency: Currency;
  openingBalance: string;
  sortOrder: number;
}

export interface AccountContext {
  /** The stored account with this id, deleted or not. */
  existing?: { currency: Currency; deletedAt: unknown };
  /** Whether live records use the account. */
  hasRecords: boolean;
}

/** Checks an account to create or replace (ADR 0017) and normalises it. */
export function prepareAccount(id: string, input: AccountInput, context: AccountContext): AccountValues {
  const openingBalance = parseMoney(input.openingBalance);
  try {
    assertValidAmount(openingBalance, input.currency);
  } catch (error) {
    if (error instanceof MoneyError) {
      throw new RuleViolationError(error.message, { openingBalance: [error.message] });
    }
    throw error;
  }

  const { existing } = context;
  if (existing?.deletedAt) throw new ConflictError(`Account ${id} was deleted.`);
  if (existing && existing.currency !== input.currency && context.hasRecords) {
    const message = "The currency can't change once the account has records.";
    throw new RuleViolationError(message, { currency: [message] });
  }

  return {
    name: input.name.trim(),
    type: input.type,
    currency: input.currency,
    openingBalance: formatMoney(openingBalance),
    sortOrder: input.sortOrder ?? 0,
  };
}

/** Account names are unique among live accounts. */
export function duplicateAccountName(name: string): ConflictError {
  return new ConflictError(`An account named "${name}" already exists.`);
}

/** An account can be deleted only while no live record uses it. */
export function assertAccountDeletable(hasRecords: boolean): void {
  if (hasRecords) throw new ConflictError('The account still has records. Delete or move them first.');
}

/** A stored record, with money as decimal strings. */
export interface StoredRecordForBalance {
  id: string;
  type: RecordType;
  occurredOn: string;
  occurredAt: string | null;
  createdAt: string;
  accountId: string;
  currency: Currency;
  counterAccountId: string | null;
  counterAmount: string | null;
  targetBalance: string | null;
  lines: readonly { amount: string; twdAmount: string }[];
}

/** Converts a stored record for `accountBalance()`. */
export function toBalanceRecord(record: StoredRecordForBalance): RecordForBalance {
  return {
    id: record.id,
    type: record.type,
    occurredOn: record.occurredOn,
    occurredAt: record.occurredAt,
    createdAt: record.createdAt,
    accountId: record.accountId,
    currency: record.currency,
    counterAccountId: record.counterAccountId,
    counterAmount: record.counterAmount === null ? null : parseMoney(record.counterAmount),
    targetBalance: record.targetBalance === null ? null : parseMoney(record.targetBalance),
    lines: record.lines.map((l) => ({ amount: parseMoney(l.amount), twdAmount: parseMoney(l.twdAmount) })),
  };
}

/** An account's derived balance as a decimal string (ADR 0011). */
export function balanceOf(
  account: { id: string; currency: Currency; openingBalance: string },
  records: readonly RecordForBalance[],
): string {
  const { balance } = accountBalance(
    { id: account.id, currency: account.currency, openingBalance: parseMoney(account.openingBalance) },
    records,
  );
  return formatMoney(balance);
}
