import { type Cents, divRound, formatDecimal, parseDecimal, roundToWholeUnit } from './money';

/**
 * A percentage in points, scaled by 10^4 to match NUMERIC(7,4):
 * "12.5" (12.5%) → 125000n.
 */
export type Percent = bigint;

const PERCENT_SCALE = 4;
const ONE_HUNDRED_PERCENT = 100n * 10n ** BigInt(PERCENT_SCALE);

export function parsePercent(value: string): Percent {
  return parseDecimal(value, PERCENT_SCALE);
}

export function formatPercent(value: Percent): string {
  return formatDecimal(value, PERCENT_SCALE);
}

/**
 * A percentage-anchored budget amount: `percent` of `base`, rounded to whole
 * TWD (ADR 0006).
 */
export function percentOf(base: Cents, percent: Percent): Cents {
  return roundToWholeUnit(divRound(base * percent, ONE_HUNDRED_PERCENT));
}

/**
 * The percentage an amount-anchored item represents, for showing next to it
 * in the editor. Returns null when the base is zero.
 */
export function percentOfBase(amount: Cents, base: Cents): Percent | null {
  if (base === 0n) return null;
  return divRound(amount * ONE_HUNDRED_PERCENT, base);
}
