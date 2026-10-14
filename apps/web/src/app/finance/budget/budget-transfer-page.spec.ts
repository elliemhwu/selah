import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TODAY } from '../../core/today';
import { FormNavigation } from '../../ui/form-navigation';
import { Toast } from '../../ui/toast';
import type { BudgetTransferDto, EnvelopeDto, PlanVersionDto } from '../data/finance-api';
import { BudgetTransferPage } from './budget-transfer-page';

const API = '/api/v1/finance';
const plan = {
  id: 'v1',
  effectiveFromMonth: '2026-09',
  items: [
    { budgetItemId: 'salary', section: 'income', name: 'Salary', parentItemId: null },
    { budgetItemId: 'allowance', section: 'expense', name: 'Allowance', parentItemId: null },
    { budgetItemId: 'travel', section: 'saving', name: 'Travel', parentItemId: null },
  ],
} as PlanVersionDto;
const saved: BudgetTransferDto = {
  id: 't1',
  kind: 'manual',
  occurredOn: '2026-09-30',
  occurredAt: '21:00',
  fromItemId: 'allowance',
  toItemId: 'travel',
  amount: '500.00',
  note: 'spare',
  createdAt: '2026-09-30T13:00:00Z',
  updatedAt: '2026-09-30T13:00:00Z',
};

describe('BudgetTransferPage', () => {
  let http: HttpTestingController;
  let leave: ReturnType<typeof vi.fn>;
  let toast: { show: ReturnType<typeof vi.fn> };

  async function render(route: { params?: Record<string, string>; query?: Record<string, string> } = {}, transfer?: BudgetTransferDto) {
    leave = vi.fn();
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      imports: [BudgetTransferPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TODAY, useValue: () => '2026-10-14' },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(route.params ?? {}), queryParamMap: convertToParamMap(route.query ?? {}) } },
        },
        { provide: FormNavigation, useValue: { leave } },
        { provide: Toast, useValue: toast },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(BudgetTransferPage);
    fixture.detectChanges();
    if (transfer) http.expectOne(`${API}/budget-transfers/${transfer.id}`).flush(transfer);
    http.expectOne((r) => r.url === `${API}/plan` && r.params.get('month') === '2026-09').flush(plan);
    http
      .expectOne((r) => r.url === `${API}/reports/envelopes` && r.params.get('date') === '2026-09-30')
      .flush([{ budgetItemId: 'allowance', available: '620.00' } as EnvelopeDto]);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const form = (fixture.componentInstance as unknown as { form: BudgetTransferPage['form'] }).form;
    const submit = async () => {
      el.querySelector('form')?.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
    };
    return { fixture, el, form, submit };
  }
  afterEach(() => http.verify());

  it('moves a leftover, dated the last day of the previous month', async () => {
    const { fixture, el, form, submit } = await render({ query: { from: 'allowance' } });
    expect(form.getRawValue()).toMatchObject({ occurredOn: '2026-09-30', fromItemId: 'allowance', toItemId: '' });
    expect(el.textContent).toContain('Left in this envelope that day: 620');
    // Income items are not budgets (ADR 0019); the others follow the plan's section order.
    const choices = [...el.querySelectorAll('#bt-to option')].map((o) => o.textContent?.trim());
    expect(choices).toEqual(['Choose a budget', 'Travel', 'Allowance']);

    form.patchValue({ toItemId: 'travel', amount: '500', note: ' Japan ' });
    await submit();
    const req = http.expectOne((r) => r.method === 'PUT' && r.url.startsWith(`${API}/budget-transfers/`));
    expect(req.request.body).toEqual({
      occurredOn: '2026-09-30',
      occurredAt: null,
      fromItemId: 'allowance',
      toItemId: 'travel',
      amount: '500',
      note: 'Japan',
    });
    req.flush(saved);
    await fixture.whenStable();
    expect(leave).toHaveBeenCalledWith('/review', 'Budget moved.');
  });

  it('takes whole TWD only', async () => {
    const { form, submit } = await render({ query: { from: 'allowance', to: 'travel' } });
    form.patchValue({ amount: '500.5' });
    await submit();
    http.expectNone((r) => r.method === 'PUT');
    expect(form.controls.amount.errors).toMatchObject({ whole: true });
  });

  it('shows a refused item on its field', async () => {
    const { fixture, form, submit } = await render({ query: { from: 'allowance', to: 'travel' } });
    form.patchValue({ amount: '500' });
    await submit();
    http.expectOne((r) => r.method === 'PUT').flush(
      { status: 422, errors: { toItemId: ['The budget item does not exist.'] } },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await fixture.whenStable();
    expect(form.controls.toItemId.errors).toEqual({ server: 'The budget item does not exist.' });
    expect(leave).not.toHaveBeenCalled();
  });

  it('edits a transfer, keeping its time, and deletes it after asking twice', async () => {
    const { fixture, el, form, submit } = await render({ params: { id: 't1' } }, saved);
    expect(form.getRawValue()).toEqual({ occurredOn: '2026-09-30', fromItemId: 'allowance', toItemId: 'travel', amount: '500', note: 'spare' });

    form.patchValue({ amount: '400' });
    await submit();
    const req = http.expectOne({ method: 'PUT', url: `${API}/budget-transfers/t1` });
    expect(req.request.body).toMatchObject({ occurredAt: '21:00', amount: '400' });
    req.flush(saved);
    await fixture.whenStable();

    fixture.detectChanges();
    const button = () => el.querySelector('.danger button') as HTMLButtonElement;
    button().click();
    fixture.detectChanges();
    expect(button().textContent).toContain('Tap again to delete this move');
    button().click();
    http.expectOne({ method: 'DELETE', url: `${API}/budget-transfers/t1` }).flush(null);
    await fixture.whenStable();
    expect(leave).toHaveBeenLastCalledWith('/review', 'Transfer deleted.');
  });
});
