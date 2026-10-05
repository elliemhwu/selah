import { formatRate, impliedRate, parseRate, toTwd } from './fx';
import { MoneyError, parseMoney } from './money';

describe('FX', () => {
  it('converts to whole TWD, half away from zero', () => {
    // 1,200 JPY × 0.2083 = 249.96 → 250
    expect(toTwd(parseMoney('1200'), parseRate('0.2083'))).toBe(parseMoney('250'));
    // 9.99 USD × 32.08 = 320.4792 → 320
    expect(toTwd(parseMoney('9.99'), parseRate('32.08'))).toBe(parseMoney('320'));
    // 10 EUR × 34.25 = 342.5 → 343
    expect(toTwd(parseMoney('10'), parseRate('34.25'))).toBe(parseMoney('343'));
  });

  it('derives the rate of an exchange from both amounts', () => {
    // 100 USD out, 3,208 TWD in
    expect(formatRate(impliedRate(parseMoney('100'), parseMoney('3208')))).toBe('32.08000000');
    // 10,000 JPY for 2,083 TWD
    expect(formatRate(impliedRate(parseMoney('10000'), parseMoney('2083')))).toBe('0.20830000');
  });

  it('rejects non-positive rates', () => {
    expect(() => parseRate('0')).toThrow(MoneyError);
    expect(() => parseRate('-1')).toThrow(MoneyError);
    expect(() => impliedRate(0n, 100n)).toThrow(MoneyError);
  });
});
