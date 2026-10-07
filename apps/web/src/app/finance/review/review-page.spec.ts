import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TODAY } from '../../core/today';
import type { ItemReviewDto, MonthlyReviewDto } from '../data/finance-api';
import { ReviewPage } from './review-page';

const API = '/api/v1/finance';
const item = (budgetItemId: string, fields: Partial<ItemReviewDto>): ItemReviewDto => ({
  budgetItemId,
  name: budgetItemId,
  section: 'expense',
  parentItemId: null,
  cadence: 'monthly',
  planned: '0.00',
  transfers: '0.00',
  actual: '0.00',
  remaining: '0.00',
  year: null,
  ...fields,
});
const section = (name: MonthlyReviewDto['sections'][number]['section'], planned: string, actual: string, remaining: string) => ({
  section: name,
  planned,
  transfers: '0.00',
  actual,
  remaining,
});
// Shaped like the API's report for October in reports.int-spec.ts.
const review: MonthlyReviewDto = {
  month: '2026-10',
  planVersionId: 'v1',
  bases: { grossIncome: '60000.00', government: '3000.00', netIncome: '57000.00' },
  sections: [
    section('income', '60000.00', '60000.00', '0.00'),
    section('government', '3000.00', '0.00', '3000.00'),
    section('offering', '0.00', '0.00', '0.00'),
    section('saving', '0.00', '0.00', '0.00'),
    section('expense', '24292.00', '15350.00', '8942.00'),
  ],
  items: [
    item('Salary', { section: 'income', planned: '60000.00', actual: '60000.00' }),
    item('Bonus', { section: 'income', cadence: 'yearly', year: { planned: '80000.00', actual: '0.00' } }),
    item('Tax', { section: 'government', planned: '3000.00', remaining: '3000.00' }),
    item('Food', { planned: '7125.00', transfers: '-4475.00', actual: '150.00', remaining: '2500.00' }),
    item('Daily Food', { parentItemId: 'Food', cadence: 'daily', planned: '5735.00', transfers: '-4475.00', actual: '150.00', remaining: '1110.00' }),
    item('Rent', { planned: '15000.00', actual: '15300.00', remaining: '-300.00' }),
  ],
  unplanned: { income: '0.00', expense: '99.00' },
};

describe('ReviewPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ReviewPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: TODAY, useValue: () => '2026-10-07' },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  async function render(report: MonthlyReviewDto | 404) {
    const fixture = TestBed.createComponent(ReviewPage);
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url === `${API}/reports/monthly` && r.params.get('month') === '2026-10');
    if (report === 404) req.flush({ status: 404 }, { status: 404, statusText: 'Not Found' });
    else req.flush(report);
    http
      .expectOne((r) => r.url === `${API}/reports/budget-transfers` && r.params.get('from') === '2026-10-01' && r.params.get('to') === '2026-10-31')
      .flush([
        { kind: 'reset', id: null, occurredOn: '2026-10-04', occurredAt: null, fromItemId: 'Daily Food', toItemId: null, amount: '740.00', note: null },
        { kind: 'manual', id: 'm1', occurredOn: '2026-10-11', occurredAt: null, fromItemId: 'Rent', toItemId: 'Food', amount: '300.00', note: 'spare' },
      ]);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();

  it('compares plan and actual per item, in tree order', async () => {
    const el = await render(review);
    expect(text(el.querySelector('.month-row'))).toContain('Net income 57,000');
    const rows = [...el.querySelectorAll('.item')];
    expect(rows.map((r) => text(r.querySelector('.item-name')))).toEqual(['Salary', 'Bonus', 'Tax', 'Food', 'Daily Food', 'Rent']);
    const byName = (name: string) => rows.find((r) => text(r.querySelector('.item-name')) === name);
    expect(text(byName('Salary'))).toContain('all received');
    expect(text(byName('Bonus'))).toContain('not this month · this year 0 of 80,000');
    expect(text(byName('Tax'))).toContain('3,000 left'); // Government is paid out, like a budget
    expect(text(byName('Food'))).toContain('2,500 left · -4,475 moved');
    expect(text(byName('Rent'))).toContain('300 over');
    expect(text(byName('Rent')?.querySelector('.item-amount'))).toBe('15,300 of 15,000');
    expect(byName('Rent')?.getAttribute('href')).toBe('/records?item=Rent');
  });

  it('shows section totals, what no item covers, and the month’s budget movements', async () => {
    const el = await render(review);
    const heads = [...el.querySelectorAll('.section-head')].map((h) => text(h));
    expect(heads[4]).toContain('Expenses');
    expect(heads[4]).toContain('15,350 of 24,292');
    expect(text(el.querySelector('.unplanned'))).toContain('spent 99 · received 0');
    const movements = [...el.querySelectorAll('.movement')].map((m) => text(m));
    expect(movements[0]).toContain('Daily Food → let go');
    expect(movements[0]).toContain('reset');
    expect(movements[1]).toContain('Rent → Food');
    expect(movements[1]).toContain('spare');
    expect(text(el.querySelector('.movements'))).toContain('Resets later this month assume nothing more is spent.');
  });

  it('says when no plan covers the month', async () => {
    const el = await render(404);
    expect(el.textContent).toContain('No plan covers this month');
  });
});
