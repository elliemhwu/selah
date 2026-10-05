import { WHOLE_UNIT_CURRENCIES, type Currency } from '@selah/shared-types';

/**
 * Money is integer cents as `bigint` inside calculations, and a decimal
 * string with 2 places ("1234.50") at the edges (ADR 0006).
 */
export type Cents = bigint;

const CENTS_PER_UNIT = 100n;

/** Thrown for malformed decimal strings or amounts that break ADR 0006. */
export class MoneyError extends Error {
  override name = 'MoneyError';
}

/** Integer division rounded half away from zero (ADR 0006). */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new MoneyError('Division by zero');
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const quotient = numerator / denominator; // truncates toward zero
  const remainder = numerator % denominator; // same sign as numerator
  const abs = remainder < 0n ? -remainder : remainder;
  if (2n * abs >= denominator) return numerator < 0n ? quotient - 1n : quotient + 1n;
  return quotient;
}

/** Parses a decimal string with at most `scale` places into a scaled integer. */
export function parseDecimal(value: string, scale: number): bigint {
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match || (match[3]?.length ?? 0) > scale) {
    throw new MoneyError(`Not a decimal with at most ${scale} places: "${value}"`);
  }
  const [, sign, whole, fraction = ''] = match;
  const scaled = BigInt(whole + fraction.padEnd(scale, '0'));
  return sign && scaled !== 0n ? -scaled : scaled;
}

/** Formats a scaled integer as a decimal string with exactly `scale` places. */
export function formatDecimal(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  return `${negative ? '-' : ''}${whole}${scale > 0 ? '.' + fraction : ''}`;
}

/** "1234.5" → 123450n */
export function parseMoney(value: string): Cents {
  return parseDecimal(value, 2);
}

/** 123450n → "1234.50" */
export function formatMoney(cents: Cents): string {
  return formatDecimal(cents, 2);
}

/** Rounds cents to a whole unit (e.g. whole TWD), half away from zero. */
export function roundToWholeUnit(cents: Cents): Cents {
  return divRound(cents, CENTS_PER_UNIT) * CENTS_PER_UNIT;
}

export function isWholeUnit(cents: Cents): boolean {
  return cents % CENTS_PER_UNIT === 0n;
}

export function requiresWholeUnits(currency: Currency): boolean {
  return WHOLE_UNIT_CURRENCIES.includes(currency);
}

/** Throws if a TWD or JPY amount has a fractional part (ADR 0006). */
export function assertValidAmount(cents: Cents, currency: Currency): void {
  if (requiresWholeUnits(currency) && !isWholeUnit(cents)) {
    throw new MoneyError(`${currency} amounts must be whole: ${formatMoney(cents)}`);
  }
}

/** Decimal places to show: 0 for TWD and JPY, 2 otherwise. */
export function displayDecimals(currency: Currency): 0 | 2 {
  return requiresWholeUnits(currency) ? 0 : 2;
}

export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0n;
  for (const value of values) total += value;
  return total;
}

/**
 * Splits `total` into whole units in proportion to `weights` (largest
 * remainder method), so the parts always add up to exactly `total`.
 * Ties go to the earlier weight.
 */
export function allocate(total: Cents, weights: readonly bigint[]): Cents[] {
  if (!isWholeUnit(total) || total < 0n) {
    throw new MoneyError(`Can only allocate a non-negative whole amount: ${formatMoney(total)}`);
  }
  if (weights.some((w) => w < 0n)) throw new MoneyError('Weights must not be negative');
  const weightSum = sumCents(weights);
  if (weightSum === 0n) throw new MoneyError('At least one weight must be positive');

  const units = total / CENTS_PER_UNIT;
  const shares = weights.map((w) => (units * w) / weightSum);
  let leftover = units - sumCents(shares);
  const byRemainder = weights
    .map((w, index) => ({ index, remainder: (units * w) % weightSum }))
    .sort((a, b) => (a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1));
  for (const { index } of byRemainder) {
    if (leftover === 0n) break;
    shares[index] += 1n;
    leftover -= 1n;
  }
  return shares.map((units) => units * CENTS_PER_UNIT);
}
