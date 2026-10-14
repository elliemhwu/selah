import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TODAY } from '../../core/today';
import { FormNavigation } from '../../ui/form-navigation';
import { Toast } from '../../ui/toast';
import type { AccountDto, PlanVersionDto, RecordDto } from '../data/finance-api';
import { CatchUpPage } from './catch-up-page';

const API = '/api/v1/finance';
const account = (id: string, currency: AccountDto['currency']) =>
  ({ id, name: id, currency, type: 'cash', openingBalance: '0.00', balance: '0.00', sortOrder: 0 }) as AccountDto;
const plan = {
  id: 'v1',
  effectiveFromMonth: '2026-10',
  items: [
    { budgetItemId: 'salary', section: 'income', name: 'Salary', parentItemId: null },
    { budgetItemId: 'food', section: 'expense', name: 'Food', parentItemId: null },
  ],
} as PlanVersionDto;
const lunch = {
  id: 'r0',
  type: 'expense',
  occurredOn: '2026-10-12',
  lines: [{ twdAmount: '185.00' }, { twdAmount: '60.00' }],
} as RecordDto;

describe('CatchUpPage', () => {
  let http: HttpTestingController;
  let leave: ReturnType<typeof vi.fn>;
  let toast: { show: ReturnType<typeof vi.fn> };

  async function render(query: Record<string, string> = {}, records: RecordDto[] = []) {
    const accounts = [account('cash', 'TWD'), account('yen', 'JPY')];
    leave = vi.fn();
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      imports: [CatchUpPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TODAY, useValue: () => '2026-10-14' },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
        { provide: FormNavigation, useValue: { leave } },
        { provide: Toast, useValue: toast },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CatchUpPage);
    fixture.detectChanges();
    http.expectOne(`${API}/accounts`).flush(accounts);
    http.expectOne(`${API}/categories`).flush([]);
    http.expectOne(`${API}/fx-rates/last-used`).flush([{ currency: 'JPY', rate: '0.21', occurredOn: '2026-10-01' }]);
    http.expectOne((r) => r.url === `${API}/plan` && r.params.get('month') === '2026-10').flush(plan);
    dayRecords(query['date'] ?? '2026-10-13', records);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const form = (fixture.componentInstance as unknown as { form: CatchUpPage['form'] }).form;
    const page = fixture.componentInstance as unknown as { saveAndNextDay(): Promise<void>; addRow(): void };
    const row = (i: number) => form.controls.rows.at(i).controls;
    return { fixture, el, form, page, row };
  }
  const dayRecords = (date: string, records: RecordDto[] = []) =>
    http.expectOne((r) => r.url === `${API}/records` && r.params.get('from') === date && r.params.get('to') === date).flush(records);
  afterEach(() => http.verify());

  it('starts on yesterday and shows what is already recorded that day', async () => {
    const { fixture, el, form } = await render({}, [lunch]);
    expect(form.getRawValue()).toMatchObject({ occurredOn: '2026-10-13', accountId: 'cash', fxRate: '' });
    fixture.detectChanges();
    expect(el.querySelector('.recorded')?.textContent?.replace(/\s+/g, ' ')).toContain('already 1 entry, 245 spent');
  });

  it("saves the day's filled rows, then moves to the next day with an empty row", async () => {
    const { fixture, form, page, row } = await renderWithDay('2026-10-12');
    row(0).amount.setValue('185');
    row(0).budgetItemId.setValue('food');
    row(0).note.setValue(' bento ');
    page.addRow();
    row(1).amount.setValue('60');
    page.addRow(); // left empty: skipped
    const firstId = row(0).id.value;

    const saving = page.saveAndNextDay();
    const req = http.expectOne((r) => r.method === 'PUT' && r.url === `${API}/records`);
    expect(req.request.body.records).toEqual([
      {
        id: firstId,
        type: 'expense',
        occurredOn: '2026-10-12',
        accountId: 'cash',
        currency: 'TWD',
        note: 'bento',
        lines: [{ amount: '185', fxRate: undefined, budgetItemId: 'food', categoryId: null }],
      },
      expect.objectContaining({ type: 'expense', note: null, lines: [expect.objectContaining({ amount: '60', budgetItemId: null })] }),
    ]);
    req.flush([]);
    await saving;
    expect(toast.show).toHaveBeenCalledWith('Saved 2 entries.');
    expect(form.getRawValue()).toMatchObject({ occurredOn: '2026-10-13', accountId: 'cash' });
    expect(form.controls.rows.length).toBe(1);
    expect(row(0).amount.value).toBe('');
    expect(row(0).id.value).not.toBe(firstId);
    fixture.detectChanges();
    dayRecords('2026-10-13');
  });

  it('just moves on from a day with nothing to add', async () => {
    const { fixture, page, form } = await renderWithDay('2026-10-12');
    await page.saveAndNextDay();
    http.expectNone((r) => r.method === 'PUT');
    expect(toast.show).not.toHaveBeenCalled();
    expect(form.controls.occurredOn.value).toBe('2026-10-13');
    fixture.detectChanges();
    dayRecords('2026-10-13');
  });

  it('enters a foreign account in its currency with the day rate', async () => {
    const { fixture, form, page, row } = await renderWithDay('2026-10-12', [], { account: 'yen' });
    expect(form.controls.fxRate.value).toBe('0.21');
    row(0).type.setValue('income');
    row(0).amount.setValue('3000');
    const saving = page.saveAndNextDay();
    const req = http.expectOne((r) => r.method === 'PUT');
    expect(req.request.body.records[0]).toMatchObject({ type: 'income', accountId: 'yen', currency: 'JPY', lines: [{ amount: '3000', fxRate: '0.21' }] });
    req.flush([]);
    await saving;
    fixture.detectChanges();
    dayRecords('2026-10-13');
  });

  it('shows a refused row on its field and keeps the day', async () => {
    const { form, page, row } = await renderWithDay('2026-10-12');
    page.addRow();
    row(1).amount.setValue('99.5');
    const saving = page.saveAndNextDay();
    http.expectOne((r) => r.method === 'PUT').flush(
      { status: 422, errors: { 'records.0.lines.0.amount': ['TWD amounts are whole units.'] } },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await saving;
    expect(row(1).amount.errors).toEqual({ server: 'TWD amounts are whole units.' });
    expect(form.controls.occurredOn.value).toBe('2026-10-12');
  });

  it("doesn't go past today", async () => {
    const { el } = await renderWithDay('2026-10-14');
    expect(el.querySelector('.next-day')).toBeNull();
    expect((el.querySelector('[aria-label="Next day"]') as HTMLButtonElement).disabled).toBe(true);
  });

  /** Renders on `date` with that day's records already answered. */
  const renderWithDay = (date: string, records: RecordDto[] = [], query: Record<string, string> = {}) =>
    render({ date, ...query }, records);
});
