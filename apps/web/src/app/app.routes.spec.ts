import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appRoutes } from './app.routes';
import { deviceData } from './data/testing';

describe('app routes', () => {
  async function landOn(url: string): Promise<string> {
    TestBed.configureTestingModule({ providers: [provideRouter(appRoutes), ...deviceData().providers] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return TestBed.inject(Router).url;
  }

  it.each([
    ['/records', '/finance/records'],
    ['/records/r1', '/finance/records/r1'],
    ['/records?account=cash&month=2026-09', '/finance/records?account=cash&month=2026-09'],
    ['/budget/items/rent', '/finance/budget/items/rent'],
    ['/review?month=2026-09', '/finance/review?month=2026-09'],
    ['/accounts/transfer/t1', '/finance/accounts/transfer/t1'],
    ['/settings/categories/new?parent=food', '/finance/categories/new?parent=food'],
  ])('sends the old link %s to %s (ADR 0030)', async (from, to) => {
    expect(await landOn(from)).toBe(to);
  });

  it('keeps Settings at /settings', async () => {
    expect(await landOn('/settings#backup')).toBe('/settings#backup');
  });

  it('sends unknown paths home', async () => {
    expect(await landOn('/nowhere')).toBe('/');
  });
});
