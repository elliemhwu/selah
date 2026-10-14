import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MoneyPipe } from './money.pipe';
import { localDateOf } from './today';

describe('MoneyPipe', () => {
  const pipe = () => TestBed.runInInjectionContext(() => new MoneyPipe());

  it('groups thousands and uses the currency decimals', () => {
    expect(pipe().transform('1234567.00')).toBe('1,234,567');
    expect(pipe().transform('1234.50', 'USD')).toBe('1,234.50');
    expect(pipe().transform('-115.00')).toBe('-115');
    expect(pipe().transform(null)).toBe('');
  });

  it('keeps every digit of large amounts', () => {
    expect(pipe().transform('999999999999.99', 'EUR')).toBe('999,999,999,999.99');
  });

  it('follows the app locale', () => {
    TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: 'de-DE' }] });
    expect(pipe().transform('1234.50', 'EUR')).toBe('1.234,50');
  });
});

describe('localDateOf', () => {
  it('uses the local calendar day', () => {
    expect(localDateOf(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDateOf(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });
});
