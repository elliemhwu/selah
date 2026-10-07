import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { TODAY } from '../../core/today';
import type { PlanVersionDto, RecordDto } from '../data/finance-api';
import { RecordsPage } from './records-page';

const API = '/api/v1/finance';
const record = (id: string, fields: Partial<RecordDto>): RecordDto => ({
  id,
  type: 'expense',
  occurredOn: '2026-10-05',
  occurredAt: null,
  accountId: 'cash',
  currency: 'TWD',
  counterAccountId: null,
  counterAmount: null,
  targetBalance: null,
  note: null,
  lines: [],
  createdAt: '2026-10-05T00:00:00Z',
  updatedAt: '2026-10-05T00:00:00Z',
  ...fields,
});
const line = (amount: string, fields: object = {}) => ({ id: amount, amount, twdAmount: amount, fxRate: null, categoryId: null, budgetItemId: null, note: null, ...fields });
const records = [
  record('salary', { type: 'income', occurredOn: '2026-10-07', lines: [line('60000.00', { budgetItemId: 'salary' })] }),
  record('lunch', { occurredOn: '2026-10-07', occurredAt: '12:30', lines: [line('150.00', { budgetItemId: 'food' }), line('80.00', { note: 'Drinks' })] }),
  record('card', { type: 'transfer', counterAccountId: 'card', counterAmount: '3200.00', lines: [line('3200.00')] }),
  record('fix', { type: 'adjustment', targetBalance: '1500.00' }),
];

describe('RecordsPage', () => {
  let http: HttpTestingController;

  function setup(query: Record<string, string> = {}) {
    TestBed.configureTestingModule({
      imports: [RecordsPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: TODAY, useValue: () => '2026-10-07' },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  }
  afterEach(() => http.verify());

  async function render(list: RecordDto[], match: (params: URLSearchParams) => boolean = () => true) {
    const fixture = TestBed.createComponent(RecordsPage);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === `${API}/records` && match(new URLSearchParams(r.params.toString())))
      .flush(list);
    http.expectOne(`${API}/accounts`).flush([
      { id: 'cash', name: 'Cash', currency: 'TWD' },
      { id: 'card', name: 'Card', currency: 'TWD' },
    ]);
    http.expectOne(`${API}/categories`).flush([]);
    http.expectOne((r) => r.url === `${API}/plan`).flush({
      items: [
        { budgetItemId: 'salary', name: 'Salary' },
        { budgetItemId: 'food', name: 'Food' },
      ],
    } as PlanVersionDto);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it("lists the month's records by day with totals", async () => {
    setup();
    const { el } = await render(records, (p) => p.get('from') === '2026-10-01' && p.get('to') === '2026-10-31');
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
    setup({ month: '2026-09', account: 'cash', type: 'expense' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const { el, fixture } = await render(
      [],
      (p) => p.get('from') === '2026-09-01' && p.get('accountId') === 'cash' && p.get('type') === 'expense',
    );
    expect(el.textContent).toContain('Nothing matches these filters this month.');

    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Clear filters'))?.click();
    fixture.detectChanges();
    expect(navigate).toHaveBeenLastCalledWith([], {
      queryParams: { month: '2026-09', account: null, category: null, item: null, type: null },
      replaceUrl: true,
    });
    http.expectOne((r) => r.url === `${API}/records` && !r.params.has('accountId')).flush([]);
    http.match(`${API}/plan`).forEach((r) => r.flush({ items: [] }));
  });
});
