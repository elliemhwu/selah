import { parseMoney } from './money';
import { formatPercent, parsePercent, percentOf, percentOfBase } from './percent';

describe('percentages', () => {
  it('parses and formats percentage points with 4 decimals', () => {
    expect(parsePercent('12.5')).toBe(125000n);
    expect(formatPercent(125000n)).toBe('12.5000');
  });

  it('takes a percentage of a base, rounded to whole TWD', () => {
    // 12.5% of 45,678 = 5,709.75 → 5,710
    expect(percentOf(parseMoney('45678'), parsePercent('12.5'))).toBe(parseMoney('5710'));
    // 10% of 45,675 = 4,567.5 → 4,568 (half away from zero)
    expect(percentOf(parseMoney('45675'), parsePercent('10'))).toBe(parseMoney('4568'));
    expect(percentOf(parseMoney('50000'), parsePercent('0'))).toBe(0n);
  });

  it('works out the percentage of an amount-anchored item', () => {
    expect(percentOfBase(parseMoney('5000'), parseMoney('40000'))).toBe(parsePercent('12.5'));
    // 1/3 → 33.3333
    expect(percentOfBase(parseMoney('1'), parseMoney('3'))).toBe(parsePercent('33.3333'));
    expect(formatPercent(parsePercent('33.3333'))).toBe('33.3333');
    expect(percentOfBase(parseMoney('5000'), 0n)).toBeNull();
  });
});
