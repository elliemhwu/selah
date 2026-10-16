import type { Currency, RecordType } from '@selah/shared-types';
import {
  accountBalance,
  type AccountForBalance,
  isRecordCurrencyAllowed,
  type RecordForBalance,
} from './balance';
import { MoneyError, parseMoney } from './money';

const m = parseMoney;
let seq = 0;

function record(
  type: RecordType,
  occurredOn: string,
  fields: Partial<RecordForBalance> & { amount?: string; twdAmount?: string } = {},
): RecordForBalance {
  seq += 1;
  const { amount, twdAmount, ...rest } = fields;
  return {
    id: `r${seq}`,
    type,
    occurredOn,
    occurredAt: null,
    createdAt: `2026-10-05T00:00:${String(seq).padStart(2, '0')}Z`,
    accountId: 'cash',
    currency: 'TWD' as Currency,
    lines: amount ? [{ amount: m(amount), twdAmount: m(twdAmount ?? amount) }] : [],
    ...rest,
  };
}

const cash: AccountForBalance = { id: 'cash', currency: 'TWD', openingBalance: m('1000') };

describe('accountBalance', () => {
  it('adds income and subtracts expenses from the opening balance', () => {
    const { balance } = accountBalance(cash, [
      record('income', '2026-10-01', { amount: '500' }),
      record('expense', '2026-10-02', { amount: '150' }),
    ]);
    expect(balance).toBe(m('1350'));
  });

  it('sums split receipts by line', () => {
    const split = record('expense', '2026-10-02', {
      lines: [
        { amount: m('120'), twdAmount: m('120') },
        { amount: m('80'), twdAmount: m('80') },
      ],
    });
    expect(accountBalance(cash, [split]).balance).toBe(m('800'));
  });

  it('moves both sides of a transfer, keeping the exact exchange', () => {
    const usd: AccountForBalance = { id: 'usd', currency: 'USD', openingBalance: 0n };
    const exchange = record('transfer', '2026-10-03', {
      amount: '3208',
      counterAccountId: 'usd',
      counterAmount: m('100'),
    });
    expect(accountBalance(cash, [exchange]).balance).toBe(m('-2208'));
    expect(accountBalance(usd, [exchange]).balance).toBe(m('100'));
  });

  it('uses the TWD amount for a foreign record on a TWD account', () => {
    const card: AccountForBalance = { id: 'card', currency: 'TWD', openingBalance: 0n };
    const lunch = record('expense', '2026-10-03', {
      accountId: 'card',
      currency: 'JPY',
      amount: '1200',
      twdAmount: '250',
    });
    expect(accountBalance(card, [lunch]).balance).toBe(m('-250'));
  });

  it('uses the original amount for a foreign-currency account', () => {
    const yen: AccountForBalance = { id: 'yen', currency: 'JPY', openingBalance: m('10000') };
    const lunch = record('expense', '2026-10-03', {
      accountId: 'yen',
      currency: 'JPY',
      amount: '1200',
      twdAmount: '250',
    });
    expect(accountBalance(yen, [lunch]).balance).toBe(m('8800'));
  });

  it('refuses a record in another currency on a non-TWD account (ADR 0016)', () => {
    const usd: AccountForBalance = { id: 'usd', currency: 'USD', openingBalance: 0n };
    const lunch = record('expense', '2026-10-03', { accountId: 'usd', currency: 'JPY', amount: '1200' });
    expect(() => accountBalance(usd, [lunch])).toThrow(MoneyError);
    expect(isRecordCurrencyAllowed('JPY', 'USD')).toBe(false);
    expect(isRecordCurrencyAllowed('JPY', 'TWD')).toBe(true);
    expect(isRecordCurrencyAllowed('USD', 'USD')).toBe(true);
  });

  it('sets the balance at an adjustment and reports the difference (ADR 0014)', () => {
    const { balance, adjustments } = accountBalance(cash, [
      record('expense', '2026-10-02', { amount: '150' }),
      record('adjustment', '2026-10-03', { targetBalance: m('800') }),
      record('expense', '2026-10-04', { amount: '50' }),
    ]);
    expect(adjustments).toEqual([{ recordId: expect.any(String), difference: m('-50') }]);
    expect(balance).toBe(m('750'));
  });

  it('keeps the adjustment target when an earlier record is edited', () => {
    const records = [
      record('expense', '2026-10-02', { amount: '150' }),
      record('adjustment', '2026-10-03', { targetBalance: m('800') }),
    ];
    records[0] = { ...records[0], lines: [{ amount: m('100'), twdAmount: m('100') }] };
    const { balance, adjustments } = accountBalance(cash, records);
    expect(balance).toBe(m('800'));
    expect(adjustments[0].difference).toBe(m('-100'));
  });

  it('orders by date, then time (no time = end of day), then creation', () => {
    const adjustment = record('adjustment', '2026-10-03', { occurredAt: '12:00', targetBalance: m('500') });
    const morning = record('expense', '2026-10-03', { occurredAt: '08:00', amount: '100' });
    const untimed = record('expense', '2026-10-03', { amount: '40' });
    // Given out of order on purpose.
    const { balance, adjustments } = accountBalance(cash, [untimed, adjustment, morning]);
    expect(adjustments[0].difference).toBe(m('-400')); // 1000 − 100 = 900 → 500
    expect(balance).toBe(m('460'));
  });

  it('can stop at a date', () => {
    const records = [
      record('income', '2026-10-01', { amount: '500' }),
      record('expense', '2026-10-05', { amount: '150' }),
    ];
    expect(accountBalance(cash, records, '2026-10-04').balance).toBe(m('1500'));
  });

  it('ignores other accounts', () => {
    const other = record('expense', '2026-10-02', { accountId: 'bank', amount: '999' });
    expect(accountBalance(cash, [other]).balance).toBe(m('1000'));
  });
});
