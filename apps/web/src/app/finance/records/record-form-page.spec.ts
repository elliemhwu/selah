import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { FormNavigation } from '../../ui/form-navigation';
import { TODAY } from '../../core/today';
import type { AccountDto, PlanVersionDto } from '../data/finance-api';
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
  ],
} as PlanVersionDto;

describe('RecordFormPage', () => {
  let http: HttpTestingController;
  let leave: ReturnType<typeof vi.fn>;

  function setup(query: Record<string, string> = {}) {
    leave = vi.fn();
    TestBed.configureTestingModule({
      imports: [RecordFormPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TODAY, useValue: () => '2026-10-07' },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
        { provide: FormNavigation, useValue: { leave } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  }

  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(RecordFormPage);
    fixture.detectChanges();
    http.expectOne(`${API}/accounts`).flush([account('cash', 'TWD'), account('usd', 'USD')]);
    http.expectOne(`${API}/categories`).flush([]);
    http.expectOne(`${API}/fx-rates/last-used`).flush([{ currency: 'USD', rate: '32.5', occurredOn: '2026-10-01' }]);
    http.expectOne((r) => r.url === `${API}/plan` && r.params.get('month') === '2026-10').flush(plan);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = (name: string) => el.querySelector<HTMLInputElement>(`[formcontrolname=${name}]`) as HTMLInputElement;
    const type = (name: string, value: string) => {
      input(name).value = value;
      input(name).dispatchEvent(new Event('input'));
    };
    const submit = async () => {
      el.querySelector('form')?.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
    };
    return { fixture, el, type, submit, component: fixture.componentInstance as unknown as { form: RecordFormPage['form'] } };
  }

  it('saves an expense on the first account, then leaves the form', async () => {
    setup();
    const { type, submit } = await render();
    type('amount', '150');
    type('note', 'lunch');
    await submit();
    const req = http.expectOne((r) => r.method === 'PUT' && r.url.startsWith(`${API}/records/`));
    expect(req.request.body).toEqual({
      type: 'expense',
      occurredOn: '2026-10-07',
      accountId: 'cash',
      currency: 'TWD',
      note: 'lunch',
      lines: [{ amount: '150', fxRate: undefined, budgetItemId: null, categoryId: null }],
    });
    req.flush({ id: 'saved' });
    await Promise.resolve();
    expect(leave).toHaveBeenCalledWith('/', 'Saved.');
  });

  it('starts from a checklist item and keeps the id when saving again', async () => {
    setup({ type: 'income', item: 'salary', amount: '60000.00' });
    const { submit, component, fixture } = await render();
    expect(component.form.getRawValue()).toMatchObject({ type: 'income', budgetItemId: 'salary', amount: '60000' });

    await submit();
    const first = http.expectOne((r) => r.method === 'PUT');
    first.flush(
      { status: 422, title: 'Unprocessable Entity', errors: { 'lines.0.amount': ['Too much.'] } },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await fixture.whenStable();
    expect(component.form.controls.amount.errors).toEqual({ server: 'Too much.' });

    component.form.controls.amount.setValue('59000');
    await submit();
    const second = http.expectOne((r) => r.method === 'PUT');
    expect(second.request.url).toBe(first.request.url);
    second.flush({ id: 'saved' });
  });

  it('drops a budget item that does not fit the record type', async () => {
    setup({ item: 'salary' });
    const { component } = await render();
    expect(component.form.controls.budgetItemId.value).toBe('');
  });

  it('pre-fills the last rate for a foreign currency and needs one to save', async () => {
    setup();
    const { component, submit, fixture } = await render();
    component.form.controls.accountId.setValue('usd');
    fixture.detectChanges();
    expect(component.form.controls.currency.value).toBe('USD');
    expect(component.form.controls.fxRate.value).toBe('32.5');

    component.form.controls.amount.setValue('10');
    component.form.controls.fxRate.setValue('');
    await submit();
    http.expectNone((r) => r.method === 'PUT');
    expect(component.form.controls.fxRate.errors).toEqual({ required: true });
  });
});
