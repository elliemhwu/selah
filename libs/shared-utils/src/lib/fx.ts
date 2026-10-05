import {
  type Cents,
  divRound,
  formatDecimal,
  MoneyError,
  parseDecimal,
  roundToWholeUnit,
} from './money';

/** An exchange rate (TWD per 1 unit of the foreign currency), scaled by 10^8 to match NUMERIC(18,8). */
export type Rate = bigint;

const RATE_SCALE = 8;
const RATE_ONE = 10n ** BigInt(RATE_SCALE);

export function parseRate(value: string): Rate {
  const rate = parseDecimal(value, RATE_SCALE);
  if (rate <= 0n) throw new MoneyError(`Exchange rate must be positive: "${value}"`);
  return rate;
}

export function formatRate(rate: Rate): string {
  return formatDecimal(rate, RATE_SCALE);
}

/** Converts a foreign amount to whole TWD at `rate` (ADR 0006). */
export function toTwd(amount: Cents, rate: Rate): Cents {
  return roundToWholeUnit(divRound(amount * rate, RATE_ONE));
}

/**
 * The rate implied by two amounts, e.g. a currency exchange that records
 * both the amount out and the amount in.
 */
export function impliedRate(foreignAmount: Cents, twdAmount: Cents): Rate {
  if (foreignAmount === 0n) throw new MoneyError('Foreign amount must not be zero');
  return divRound(twdAmount * RATE_ONE, foreignAmount);
}
