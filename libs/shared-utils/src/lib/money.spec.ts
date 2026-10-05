import {
  allocate,
  assertValidAmount,
  displayDecimals,
  divRound,
  formatDecimal,
  formatMoney,
  MoneyError,
  parseDecimal,
  parseMoney,
  roundToWholeUnit,
} from './money';

describe('divRound (half away from zero)', () => {
  it.each([
    [5n, 2n, 3n],
    [-5n, 2n, -3n],
    [4n, 3n, 1n],
    [-4n, 3n, -1n],
    [7n, 2n, 4n],
    [6n, 4n, 2n],
    [5n, -2n, -3n],
    [0n, 7n, 0n],
  ])('%s / %s = %s', (n, d, expected) => {
    expect(divRound(n, d)).toBe(expected);
  });

  it('rejects division by zero', () => {
    expect(() => divRound(1n, 0n)).toThrow(MoneyError);
  });
});

describe('parseMoney / formatMoney', () => {
  it.each([
    ['1234.50', 123450n],
    ['1234.5', 123450n],
    ['1234', 123400n],
    ['0.05', 5n],
    ['-0.05', -5n],
    ['-12', -1200n],
    ['-0', 0n],
    ['99999999999999.99', 9999999999999999n],
  ])('parses "%s"', (input, cents) => {
    expect(parseMoney(input)).toBe(cents);
  });

  it.each(['', '1.234', '1,234', 'abc', '.5', '1.', '+1', '1e3'])('rejects "%s"', (input) => {
    expect(() => parseMoney(input)).toThrow(MoneyError);
  });

  it.each([
    [123450n, '1234.50'],
    [5n, '0.05'],
    [-5n, '-0.05'],
    [0n, '0.00'],
    [-123400n, '-1234.00'],
  ])('formats %s as "%s"', (cents, output) => {
    expect(formatMoney(cents)).toBe(output);
  });

  it('round-trips', () => {
    for (const value of ['0.01', '-7.10', '1000000.00']) {
      expect(formatMoney(parseMoney(value))).toBe(value);
    }
  });

  it('handles other scales', () => {
    expect(parseDecimal('31.25', 8)).toBe(3125000000n);
    expect(formatDecimal(3125000000n, 8)).toBe('31.25000000');
    expect(formatDecimal(7n, 0)).toBe('7');
  });
});

describe('roundToWholeUnit', () => {
  it.each([
    [12349n, 12300n],
    [12350n, 12400n],
    [-12350n, -12400n],
    [-12349n, -12300n],
    [100n, 100n],
  ])('%s → %s', (cents, expected) => {
    expect(roundToWholeUnit(cents)).toBe(expected);
  });
});

describe('whole units for TWD and JPY (ADR 0006)', () => {
  it('rejects fractional TWD and JPY', () => {
    expect(() => assertValidAmount(10050n, 'TWD')).toThrow(MoneyError);
    expect(() => assertValidAmount(10050n, 'JPY')).toThrow(MoneyError);
  });

  it('accepts whole TWD and cents in other currencies', () => {
    expect(() => assertValidAmount(10000n, 'TWD')).not.toThrow();
    expect(() => assertValidAmount(10050n, 'USD')).not.toThrow();
  });

  it('shows 0 decimals for TWD/JPY and 2 for others', () => {
    expect(displayDecimals('TWD')).toBe(0);
    expect(displayDecimals('JPY')).toBe(0);
    expect(displayDecimals('EUR')).toBe(2);
  });
});

describe('allocate', () => {
  it('splits evenly when it can', () => {
    expect(allocate(30000n, [1n, 1n, 1n])).toEqual([10000n, 10000n, 10000n]);
  });

  it('gives the remainder to the largest fractions, ties to the earliest', () => {
    // 100 TWD in thirds: 33.33 each → one extra unit to the first.
    expect(allocate(10000n, [1n, 1n, 1n])).toEqual([3400n, 3300n, 3300n]);
    // 10 TWD at 15% / 35% / 50%: 1.5, 3.5, 5 → 2, 3, 5 (tie goes earlier).
    expect(allocate(1000n, [15n, 35n, 50n])).toEqual([200n, 300n, 500n]);
  });

  it('always adds up to the total', () => {
    const parts = allocate(4567800n, [125000n, 333333n, 41667n, 500000n]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(4567800n);
    expect(parts.every((p) => p % 100n === 0n)).toBe(true);
  });

  it('rejects fractional totals and all-zero weights', () => {
    expect(() => allocate(150n, [1n])).toThrow(MoneyError);
    expect(() => allocate(100n, [0n, 0n])).toThrow(MoneyError);
    expect(() => allocate(-100n, [1n])).toThrow(MoneyError);
  });
});
