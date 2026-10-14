import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { TODAY } from '../../core/today';
import { FormNavigation } from '../../ui/form-navigation';
import type { AccountDto, PlanVersionDto, RecordDto } from '../data/finance-api';
import { RecordFormPage } from './record-form-page';

const API = '/api/v1/finance';
const account = (id: string, currency: AccountDto['currency']) =>
  ({ id, name: id, currency, type: 'cash', openingBalance: '0.00', balance: '0.00', sortOrder: 0 }) as AccountDto;
const plan = {
  id: 'v1',
  effectiveFromMonth: '2026-10',
  items: [
    { budgetItemId: 'salary', section: 'income', name: 'Salary', parentItemId: null },
    { budgetItemId: 'rent', section: 'expense', name: 'Rent', parentItemId: null },
    { budgetItemId: 'food', section: 'expense', name: 'Food', parentItemId: null },
  ],
} as PlanVersionDto;
const saved: RecordDto = {
  id: 'r1',
  type: 'expense',
  occurredOn: '2026-10-05',
  occurredAt: '12:30',
  accountId: 'cash',
  currency: 'TWD',
  counterAccountId: null,
  counterAmount: null,
  targetBalance: null,
  note: 'Market',
  lines: [
    { id: 'l1', amount: '150.00', twdAmount: '150.00', fxRate: null, categoryId: null, budgetItemId: 'food', note: 'Veg' },
    { id: 'l2', amount: '80.00', twdAmount: '80.00', fxRate: null, categoryId: null, budgetItemId: 'rent', note: null },
  ],
  createdAt: '2026-10-05T04:30:00Z',
  updatedAt: '2026-10-05T04:30:00Z',
};

describe('RecordFormPage', () => {
  let http: HttpTestingController;
  let leave: ReturnType<typeof vi.fn>;

  function setup(route: { query?: Record<string, string>; params?: Record<string, string> } = {}) {
    leave = vi.fn();
    TestBed.configureTestingModule({
      imports: [RecordFormPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TODAY, useValue: () => '2026-10-07' },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(route.query ?? {}), paramMap: convertToParamMap(route.params ?? {}) } },
        },
        { provide: FormNavigation, useValue: { leave } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  }

  afterEach(() => http.verify());

  async function render(record?: RecordDto) {
    const fixture = TestBed.createComponent(RecordFormPage);
    fixture.detectChanges();
    if (record) http.expectOne(`${API}/records/${record.id}`).flush(record);
    http.expectOne(`${API}/accounts`).flush([account('cash', 'TWD'), account('usd', 'USD')]);
    http.expectOne(`${API}/categories`).flush([]);
    http.expectOne(`${API}/fx-rates/last-used`).flush([{ currency: 'USD', rate: '32.5', occurredOn: '2026-10-01' }]);
    http.expectOne((r) => r.url === `${API}/plan` && r.params.get('month') === '2026-10').flush(plan);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const component = fixture.componentInstance as unknown as { form: RecordFormPage['form'] };
    const submit = async () => {
      el.querySelector('form')?.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
    };
    return { fixture, el, submit, form: component.form, line: (i: number) => component.form.controls.lines.at(i).controls };
  }

  it('saves an expense on the first account, then leaves the form', async () => {
    setup();
    const { el, submit } = await render();
    const amount = el.querySelector<HTMLInputElement>('#rec-amount') as HTMLInputElement;
    amount.value = '150';
    amount.dispatchEvent(new Event('input'));
    const note = el.querySelector<HTMLInputElement>('#rec-note') as HTMLInputElement;
    note.value = 'lunch';
    note.dispatchEvent(new Event('input'));
    await submit();
    const req = http.expectOne((r) => r.method === 'PUT' && r.url.startsWith(`${API}/records/`));
    expect(req.request.body).toMatchObject({
      type: 'expense',
      occurredOn: '2026-10-07',
      occurredAt: null,
      accountId: 'cash',
      currency: 'TWD',
      note: 'lunch',
      lines: [{ amount: '150', fxRate: undefined, budgetItemId: null, categoryId: null, note: null }],
    });
    expect(req.request.body.lines[0].id).toMatch(/^[0-9a-f-]{36}$/);
    req.flush({ id: 'saved' });
    await Promise.resolve();
    expect(leave).toHaveBeenCalledWith('/', 'Saved.');
  });

  it('starts from a checklist item and keeps the ids when saving again', async () => {
    setup({ query: { type: 'income', item: 'salary', amount: '60000.00' } });
    const { submit, form, line, fixture } = await render();
    expect(form.controls.type.value).toBe('income');
    expect(line(0).budgetItemId.value).toBe('salary');
    expect(line(0).amount.value).toBe('60000');

    await submit();
    const first = http.expectOne((r) => r.method === 'PUT');
    first.flush(
      { status: 422, title: 'Unprocessable Entity', errors: { 'lines.0.amount': ['Too much.'] } },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await fixture.whenStable();
    expect(line(0).amount.errors).toEqual({ server: 'Too much.' });

    line(0).amount.setValue('59000');
    await submit();
    const second = http.expectOne((r) => r.method === 'PUT');
    expect(second.request.url).toBe(first.request.url);
    expect(second.request.body.lines[0].id).toBe(first.request.body.lines[0].id);
    second.flush({ id: 'saved' });
  });

  it('splits a receipt into lines and shows the total', async () => {
    setup();
    const { el, fixture, form, line, submit } = await render();
    line(0).amount.setValue('150');
    line(0).budgetItemId.setValue('food');
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Split into another line'))?.click();
    fixture.detectChanges();
    line(1).amount.setValue('80');
    line(1).budgetItemId.setValue('rent');
    fixture.detectChanges();
    expect(el.querySelector('.total')?.textContent).toContain('230');
    expect(form.controls.lines.length).toBe(2);
    await submit();
    const req = http.expectOne((r) => r.method === 'PUT');
    expect(req.request.body.lines.map((l: { amount: string; budgetItemId: string }) => [l.amount, l.budgetItemId])).toEqual([
      ['150', 'food'],
      ['80', 'rent'],
    ]);
    req.flush({});
  });

  it('edits a saved record, keeping its line ids, and deletes it after a second tap', async () => {
    setup({ params: { id: 'r1' } });
    const { el, fixture, form, line, submit } = await render(saved);
    expect(form.getRawValue()).toMatchObject({ occurredOn: '2026-10-05', occurredAt: '12:30', note: 'Market' });
    expect(form.controls.lines.length).toBe(2);
    expect(line(0).note.value).toBe('Veg');

    line(1).amount.setValue('90');
    await submit();
    const req = http.expectOne({ method: 'PUT', url: `${API}/records/r1` });
    expect(req.request.body.lines.map((l: { id: string; amount: string }) => [l.id, l.amount])).toEqual([
      ['l1', '150'],
      ['l2', '90'],
    ]);
    req.flush(saved);
    await fixture.whenStable();
    expect(leave).toHaveBeenCalledWith('/records', 'Saved.');
    fixture.detectChanges(); // the button is enabled again once saving ends

    const button = () => el.querySelector('.danger button') as HTMLButtonElement;
    button().click();
    fixture.detectChanges();
    expect(button().textContent).toContain('Tap again');
    button().click();
    http.expectOne({ method: 'DELETE', url: `${API}/records/r1` }).flush(null);
    await fixture.whenStable();
    expect(leave).toHaveBeenLastCalledWith('/records', 'Entry deleted.');
  });

  it('sends transfers to their own form', async () => {
    setup({ params: { id: 't1' } });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(RecordFormPage);
    fixture.detectChanges();
    http.expectOne(`${API}/records/t1`).flush({ ...saved, id: 't1', type: 'transfer' });
    await Promise.resolve();
    fixture.detectChanges();
    expect(navigate).toHaveBeenCalledWith(['/accounts', 'transfer', 't1'], { replaceUrl: true });
    http.match(() => true).forEach((r) => r.flush([]));
  });

  it('drops a budget item that does not fit the record type', async () => {
    setup({ query: { item: 'salary' } });
    const { line } = await render();
    expect(line(0).budgetItemId.value).toBe('');
  });

  it('pre-fills the last rate for a foreign currency and needs one to save', async () => {
    setup();
    const { form, line, submit, fixture } = await render();
    form.controls.accountId.setValue('usd');
    fixture.detectChanges();
    expect(form.controls.currency.value).toBe('USD');
    expect(form.controls.fxRate.value).toBe('32.5');

    line(0).amount.setValue('10');
    form.controls.fxRate.setValue('');
    await submit();
    http.expectNone((r) => r.method === 'PUT');
    expect(form.controls.fxRate.errors).toEqual({ required: true });
  });
});
