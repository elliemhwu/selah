import type { Currency, LocalDate, RecordType } from '@selah/shared-types';
import { type Cents, MoneyError, sumCents } from './money';

// Account balances, derived from records (ADR 0011, 0013, 0014, 0016).

export interface AccountForBalance {
  id: string;
  currency: Currency;
  openingBalance: Cents;
}

export interface RecordForBalance {
  id: string;
  type: RecordType;
  occurredOn: LocalDate;
  /** Local time 'HH:MM[:SS]', or null when not entered. */
  occurredAt: string | null;
  /** ISO timestamp; breaks ties between records at the same date and time. */
  createdAt: string;
  accountId: string;
  currency: Currency;
  /** Transfer only: the receiving account and the amount it receives (in its own currency). */
  counterAccountId?: string | null;
  counterAmount?: Cents | null;
  /** Adjustment only. */
  targetBalance?: Cents | null;
  lines: readonly { amount: Cents; twdAmount: Cents }[];
}

export interface AdjustmentEffect {
  recordId: string;
  /** targetBalance − the balance just before the adjustment. */
  difference: Cents;
}

export interface BalanceResult {
  balance: Cents;
  adjustments: AdjustmentEffect[];
}

/**
 * Whether a record in `recordCurrency` may be posted to an account in
 * `accountCurrency` (ADR 0016): the same currency, or any currency on a TWD
 * account (the line's `twdAmount` moves the balance).
 */
export function isRecordCurrencyAllowed(recordCurrency: Currency, accountCurrency: Currency): boolean {
  return recordCurrency === accountCurrency || accountCurrency === 'TWD';
}

/** A line's amount in the account's currency. */
function lineAmountForAccount(
  line: { amount: Cents; twdAmount: Cents },
  recordCurrency: Currency,
  accountCurrency: Currency,
): Cents {
  if (recordCurrency === accountCurrency) return line.amount;
  if (accountCurrency === 'TWD') return line.twdAmount;
  throw new MoneyError(`A ${recordCurrency} record can't be posted to a ${accountCurrency} account`);
}

/**
 * Order of records within an account: date, then time (records without a time
 * count as the end of the day), then creation time (ADR 0014).
 */
export function compareRecords(a: RecordForBalance, b: RecordForBalance): number {
  if (a.occurredOn !== b.occurredOn) return a.occurredOn < b.occurredOn ? -1 : 1;
  const aTime = a.occurredAt ?? '99';
  const bTime = b.occurredAt ?? '99';
  if (aTime !== bTime) return aTime < bTime ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return 0;
}

/**
 * The account's balance after all given records up to and including `asOf`.
 * Pass the account's non-deleted records, in any order.
 */
export function accountBalance(
  account: AccountForBalance,
  records: readonly RecordForBalance[],
  asOf?: LocalDate,
): BalanceResult {
  let balance = account.openingBalance;
  const adjustments: AdjustmentEffect[] = [];
  const relevant = records
    .filter((r) => r.accountId === account.id || r.counterAccountId === account.id)
    .filter((r) => asOf === undefined || r.occurredOn <= asOf)
    .sort(compareRecords);

  for (const record of relevant) {
    const lines = () =>
      sumCents(record.lines.map((line) => lineAmountForAccount(line, record.currency, account.currency)));

    switch (record.type) {
      case 'income':
        balance += lines();
        break;
      case 'expense':
        balance -= lines();
        break;
      case 'transfer':
        if (record.accountId === account.id) balance -= lines();
        if (record.counterAccountId === account.id) {
          if (record.counterAmount == null) throw new MoneyError(`Transfer ${record.id} has no counter amount`);
          balance += record.counterAmount;
        }
        break;
      case 'adjustment': {
        if (record.targetBalance == null) throw new MoneyError(`Adjustment ${record.id} has no target balance`);
        adjustments.push({ recordId: record.id, difference: record.targetBalance - balance });
        balance = record.targetBalance;
        break;
      }
    }
  }

  return { balance, adjustments };
}
