import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TODAY } from '../../core/today';
import type { DeviceSnapshot } from '../../data/device-storage';
import { deviceData, planItem, settle, storedLine, storedRecord, storedTransfer, storedVersion } from '../../data/testing';
import { ReviewPage } from './review-page';

// October 2026, with today the 7th; weeks start on Monday. The plan starts in
// January, so the yearly bonus is planned this year.
const plan = storedVersion('v1', '2026-01', [
  planItem('Salary', { section: 'income', amount: '60000.00' }),
  planItem('Bonus', { section: 'income', cadence: 'yearly', cadenceMonth: 1, amount: '80000.00' }),
  planItem('Tax', { section: 'government', amount: '3000.00' }),
  planItem('Food', { amount: '6000.00' }),
  planItem('Daily Food', {
    parentItemId: 'Food',
    cadence: 'daily',
    amount: '100.00',
    rollover: true,
    resetCycle: 'week',
    onReset: 'drop',
  }),
  planItem('Rent', { amount: '15000.00' }),
  planItem('Fun', { amount: '1000.00' }),
]);
const record = (id: string, type: 'income' | 'expense', occurredOn: string, amount: string, budgetItemId: string | null) =>
  storedRecord(id, { type, occurredOn, lines: [storedLine(`${id}-l`, amount, { budgetItemId })] });
const data: Partial<DeviceSnapshot> = {
  planVersions: [plan],
  records: [
    record('pay', 'income', '2026-10-05', '60000.00', 'Salary'),
    record('rent', 'expense', '2026-10-01', '15300.00', 'Rent'),
    record('lunch', 'expense', '2026-10-06', '150.00', 'Daily Food'),
    record('misc', 'expense', '2026-10-06', '99.00', null),
  ],
  budgetTransfers: [storedTransfer('m1', { occurredOn: '2026-10-08', fromItemId: 'Fun', toItemId: 'Food', amount: '300.00', note: 'spare' })],
};

describe('ReviewPage', () => {
  async function render(seed: Partial<DeviceSnapshot> = data) {
    TestBed.configureTestingModule({
      imports: [ReviewPage],
      providers: [
        provideRouter([]),
        ...deviceData(seed).providers,
        { provide: TODAY, useValue: () => '2026-10-07' },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      ],
    });
    const fixture = TestBed.createComponent(ReviewPage);
    await settle(fixture);
    return fixture.nativeElement as HTMLElement;
  }

  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();

  it('compares plan and actual per item, in tree order', async () => {
    const el = await render();
    expect(text(el.querySelector('.month-row'))).toContain('Net income 57,000');
    const rows = [...el.querySelectorAll('.item')];
    expect(rows.map((r) => text(r.querySelector('.item-name')))).toEqual(['Salary', 'Bonus', 'Tax', 'Food', 'Daily Food', 'Rent', 'Fun']);
    const byName = (name: string) => rows.find((r) => text(r.querySelector('.item-name')) === name);
    expect(text(byName('Salary'))).toContain('all received');
    expect(text(byName('Bonus'))).toContain('not this month · this year 0 of 80,000');
    expect(text(byName('Tax'))).toContain('3,000 left'); // Government is paid out, like a budget
    // Food: 6,000 planned, 300 moved in, and its child's weekly leftovers dropped on
    // 4, 11, 18 and 25 Oct (700 + 550 + 700 + 700); 150 spent.
    expect(text(byName('Food'))).toContain('3,500 left · -2,350 moved');
    expect(text(byName('Rent'))).toContain('300 over');
    expect(text(byName('Rent')?.querySelector('.item-amount'))).toBe('15,300 of 15,000');
    expect(byName('Rent')?.getAttribute('href')).toBe('/records?item=Rent');
  });

  it('shows section totals, what no item covers, and the month’s budget movements', async () => {
    const el = await render();
    const heads = [...el.querySelectorAll('.section-head')].map((h) => text(h));
    expect(heads[4]).toContain('Expenses');
    expect(heads[4]).toContain('15,450 of 22,000');
    expect(text(el.querySelector('.unplanned'))).toContain('spent 99 · received 0');
    const movements = [...el.querySelectorAll('.movement')].map((m) => text(m));
    expect(movements[0]).toContain('Daily Food → let go');
    expect(movements[0]).toContain('reset');
    expect(movements[1]).toContain('Fun → Food');
    expect(movements[1]).toContain('spare');
    expect(text(el.querySelector('.movements'))).toContain('Resets later this month assume nothing more is spent.');
  });

  it('opens manual budget moves for editing, but not computed resets', async () => {
    const el = await render();
    const movements = [...el.querySelectorAll('.movement')];
    expect(movements[0].getAttribute('href')).toBeNull();
    expect(movements[1].getAttribute('href')).toBe('/budget/transfers/m1');
    // In the current month, a new move is dated today.
    expect(el.querySelector('.move-budget')?.getAttribute('href')).toBe('/budget/transfers/new?date=2026-10-07');
  });

  it('says when no plan covers the month', async () => {
    const el = await render({});
    expect(el.textContent).toContain('No plan covers this month');
  });
});
