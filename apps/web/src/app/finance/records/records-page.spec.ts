import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { TODAY } from '../../core/today';
import type { StoredRecord } from '../../data/device-storage';
import { deviceData, planItem, settle, storedAccount, storedLine, storedRecord, storedVersion } from '../../data/testing';
import { RecordsPage } from './records-page';

const line = (amount: string, fields: object = {}) => storedLine(amount, amount, fields);
const records = [
  storedRecord('salary', { type: 'income', occurredOn: '2026-10-07', lines: [line('60000.00', { budgetItemId: 'salary' })] }),
  storedRecord('lunch', { occurredOn: '2026-10-07', occurredAt: '12:30', lines: [line('150.00', { budgetItemId: 'food' }), line('80.00', { note: 'Drinks' })] }),
  storedRecord('card', { type: 'transfer', counterAccountId: 'card', counterAmount: '3200.00', lines: [line('3200.00')] }),
  storedRecord('fix', { type: 'adjustment', targetBalance: '1500.00' }),
  // Outside the month, and deleted: never listed.
  storedRecord('sept', { occurredOn: '2026-09-30', lines: [line('5.00')] }),
  storedRecord('gone', { occurredOn: '2026-10-06', lines: [line('9.00')], deletedAt: 'x' }),
];

describe('RecordsPage', () => {
  async function render(query: Record<string, string> = {}, seed: StoredRecord[] = records) {
    TestBed.configureTestingModule({
      imports: [RecordsPage],
      providers: [
        provideRouter([]),
        ...deviceData({
          accounts: [storedAccount('cash', 'TWD', { name: 'Cash' }), storedAccount('card', 'TWD', { name: 'Card' })],
          planVersions: [storedVersion('v1', '2026-10', [planItem('salary', { section: 'income', name: 'Salary' }), planItem('food', { name: 'Food' })])],
          records: seed,
        }).providers,
        { provide: TODAY, useValue: () => '2026-10-07' },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      ],
    });
    const fixture = TestBed.createComponent(RecordsPage);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it("lists the month's records by day with totals", async () => {
    const { el } = await render();
    expect([...el.querySelectorAll('.day')].map((d) => d.textContent?.trim())).toEqual(['Wed 7 Oct', 'Mon 5 Oct']);
    const rows = [...el.querySelectorAll('.record')];
    expect(rows.map((r) => r.querySelector('.record-title')?.textContent?.trim())).toEqual([
      'Salary',
      'Food and 1 more',
      'Cash → Card',
      'Cash set to actual balance',
    ]);
    expect(rows.map((r) => r.querySelector('.record-amount')?.textContent?.replace(/\s+/g, '').trim())).toEqual([
      '+60,000',
      '−230',
      '3,200',
      '=1,500',
    ]);
    expect(rows[1].textContent).toContain('Cash · 12:30');
    expect(rows.map((r) => r.getAttribute('href'))).toEqual([
      '/records/salary',
      '/records/lunch',
      '/accounts/transfer/card',
      '/accounts/adjust/fix',
    ]);
    expect(el.querySelector('.month-row')?.textContent).toContain('Spent 230');
    expect(el.querySelector('.month-row')?.textContent).toContain('received 60,000');
  });

  it('reads the month and filters from the address and keeps them there', async () => {
    const navigate = vi.spyOn(Router.prototype, 'navigate').mockResolvedValue(true);
    const { el, fixture } = await render({ month: '2026-09', account: 'card', type: 'expense' });
    expect(el.textContent).toContain('Nothing matches these filters this month.');

    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Clear filters'))?.click();
    fixture.detectChanges();
    expect(navigate).toHaveBeenLastCalledWith([], {
      queryParams: { month: '2026-09', account: null, category: null, item: null, type: null },
      replaceUrl: true,
    });
    expect([...el.querySelectorAll('.record')].map((r) => r.getAttribute('href'))).toEqual(['/records/sept']);
    navigate.mockRestore();
  });
});
