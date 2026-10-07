import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TODAY } from '../../core/today';
import { FormNavigation } from '../../ui/form-navigation';
import type { AccountDto } from '../data/finance-api';
import { AccountFormPage } from './account-form-page';
import { AccountsPage } from './accounts-page';
import { AdjustPage } from './adjust-page';
import { TransferPage } from './transfer-page';

const API = '/api/v1/finance';
const account = (id: string, currency: AccountDto['currency'], balance: string, type: AccountDto['type'] = 'cash') =>
  ({ id, name: id, type, currency, openingBalance: '0.00', balance, sortOrder: 0 }) as AccountDto;
const accounts = [account('Cash', 'TWD', '1500.00'), account('Card', 'TWD', '-3200.00', 'credit_card'), account('USD', 'USD', '120.50', 'bank')];

async function submit(fixture: { nativeElement: HTMLElement; whenStable: () => Promise<unknown> }) {
  fixture.nativeElement.querySelector('form')?.dispatchEvent(new Event('submit'));
  await fixture.whenStable();
}

describe('AccountsPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AccountsPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  async function render(list: AccountDto[]) {
    const fixture = TestBed.createComponent(AccountsPage);
    fixture.detectChanges();
    http.expectOne(`${API}/accounts`).flush(list);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('lists balances and a total per currency', async () => {
    const el = await render(accounts);
    const rows = [...el.querySelectorAll('.account')];
    expect(rows.map((r) => r.querySelector('.account-name')?.firstChild?.textContent?.trim())).toEqual(['Cash', 'Card', 'USD']);
    expect(rows[1].textContent).toContain('Credit card');
    expect(rows[1].querySelector('.balance')?.classList).toContain('negative');
    expect(rows[2].querySelector('.balance')?.textContent).toContain('120.50');
    const totals = [...el.querySelectorAll('.total')].map((t) => [
      t.firstElementChild?.textContent?.trim(),
      t.querySelector('.amount')?.textContent?.trim(),
    ]);
    expect(totals).toEqual([
      ['TWD', '-1,700'],
      ['USD', '120.50'],
    ]);
  });

  it('links to the account forms', async () => {
    const el = await render(accounts);
    expect(el.querySelector('.account')?.getAttribute('href')).toBe('/accounts/Cash');
    const hrefs = [...el.querySelectorAll('.actions a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/accounts/transfer', '/accounts/adjust', '/accounts/new']);
  });

  it('invites a first account', async () => {
    const el = await render([]);
    expect(el.textContent).toContain('No accounts yet.');
    expect([...el.querySelectorAll('.actions a')].map((a) => a.textContent?.trim())).toEqual(['New account']);
  });
});

describe('account form pages', () => {
  let http: HttpTestingController;
  let leave: ReturnType<typeof vi.fn>;

  function setup<T>(component: Type<T>, route: { params?: Record<string, string>; query?: Record<string, string> } = {}) {
    leave = vi.fn();
    TestBed.configureTestingModule({
      imports: [component],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TODAY, useValue: () => '2026-10-07' },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(route.params ?? {}), queryParamMap: convertToParamMap(route.query ?? {}) } },
        },
        { provide: FormNavigation, useValue: { leave } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    return fixture;
  }
  const formOf = <F>(fixture: { componentInstance: unknown }) => (fixture.componentInstance as { form: F }).form;
  afterEach(() => http.verify());

  describe('AccountFormPage', () => {
    it('creates an account with a negative opening balance', async () => {
      const fixture = setup(AccountFormPage);
      const form = formOf<AccountFormPage['form']>(fixture);
      form.patchValue({ name: ' Card ', type: 'credit_card', openingBalance: '-3200' });
      await submit(fixture);
      const req = http.expectOne((r) => r.method === 'PUT' && r.url.startsWith(`${API}/accounts/`));
      expect(req.request.body).toEqual({ name: 'Card', type: 'credit_card', currency: 'TWD', openingBalance: '-3200', sortOrder: 0 });
      req.flush({});
      await fixture.whenStable();
      expect(leave).toHaveBeenCalledWith('/accounts', 'Account saved.');
    });

    it('loads the account to edit and shows a refused currency change on its field', async () => {
      const fixture = setup(AccountFormPage, { params: { id: 'Cash' } });
      http.expectOne(`${API}/accounts/Cash`).flush(accounts[0]);
      await fixture.whenStable();
      const form = formOf<AccountFormPage['form']>(fixture);
      expect(form.getRawValue()).toEqual({ name: 'Cash', type: 'cash', currency: 'TWD', openingBalance: '0' });

      form.patchValue({ currency: 'JPY' });
      await submit(fixture);
      http.expectOne((r) => r.method === 'PUT' && r.url === `${API}/accounts/Cash`).flush(
        { status: 422, errors: { currency: ["The currency can't change once the account has records."] } },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      await fixture.whenStable();
      expect(form.controls.currency.errors).toEqual({ server: "The currency can't change once the account has records." });
    });

    it('says when the account does not exist', async () => {
      const fixture = setup(AccountFormPage, { params: { id: 'gone' } });
      http.expectOne(`${API}/accounts/gone`).flush({ status: 404 }, { status: 404, statusText: 'Not Found' });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain("This account isn't in the ledger.");
    });

    it('asks twice before deleting', async () => {
      const fixture = setup(AccountFormPage, { params: { id: 'Cash' } });
      http.expectOne(`${API}/accounts/Cash`).flush(accounts[0]);
      await fixture.whenStable();
      fixture.detectChanges();
      const button = () => fixture.nativeElement.querySelector('.danger button') as HTMLButtonElement;
      button().click();
      fixture.detectChanges();
      expect(button().textContent).toContain('Tap again to delete Cash');
      http.expectNone({ method: 'DELETE' });
      button().click();
      http.expectOne({ method: 'DELETE', url: `${API}/accounts/Cash` }).flush(null);
      await fixture.whenStable();
      expect(leave).toHaveBeenCalledWith('/accounts', 'Account deleted.');
    });

    it('cancels back to the accounts', () => {
      const fixture = setup(AccountFormPage);
      (fixture.nativeElement.querySelector('.form-header .btn-quiet') as HTMLButtonElement).click();
      expect(leave).toHaveBeenCalledWith('/accounts');
    });
  });

  describe('TransferPage', () => {
    async function render(query: Record<string, string> = {}, rates: object[] = []) {
      const fixture = setup(TransferPage, { query });
      http.expectOne(`${API}/fx-rates/last-used`).flush(rates);
      http.expectOne(`${API}/accounts`).flush(accounts);
      await fixture.whenStable();
      return { fixture, form: formOf<TransferPage['form']>(fixture) };
    }

    it('transfers between TWD accounts with one amount', async () => {
      const { fixture, form } = await render();
      expect(form.getRawValue()).toMatchObject({ fromAccountId: 'Cash', toAccountId: 'Card' });
      form.patchValue({ amount: '3200' });
      await submit(fixture);
      const req = http.expectOne((r) => r.method === 'PUT');
      expect(req.request.body).toMatchObject({
        type: 'transfer',
        accountId: 'Cash',
        currency: 'TWD',
        counterAccountId: 'Card',
        counterAmount: '3200',
        lines: [{ amount: '3200' }],
      });
      req.flush({});
      await fixture.whenStable();
      expect(leave).toHaveBeenCalledWith('/accounts', 'Transfer saved.');
    });

    it('asks for the amount received and the rate in an exchange', async () => {
      const { fixture, form } = await render({ from: 'USD' }, [{ currency: 'USD', rate: '32.1', occurredOn: '2026-10-01' }]);
      expect(form.getRawValue()).toMatchObject({ fromAccountId: 'USD', toAccountId: 'Cash', fxRate: '32.1' });
      form.patchValue({ amount: '100' });
      await submit(fixture);
      http.expectNone({ method: 'PUT' });
      expect(form.controls.counterAmount.errors).toEqual({ required: true });

      form.patchValue({ counterAmount: '3205' });
      await submit(fixture);
      const req = http.expectOne((r) => r.method === 'PUT');
      expect(req.request.body).toMatchObject({
        accountId: 'USD',
        currency: 'USD',
        counterAccountId: 'Cash',
        counterAmount: '3205',
        lines: [{ amount: '100', fxRate: '32.1' }],
      });
      req.flush({});
    });
  });

  describe('editing transfers and adjustments', () => {
    it('loads a transfer, saves it under the same id, and deletes it after a second tap', async () => {
      const fixture = setup(TransferPage, { params: { id: 't1' } });
      http.expectOne(`${API}/records/t1`).flush({
        id: 't1', type: 'transfer', occurredOn: '2026-10-03', occurredAt: null, accountId: 'Cash', currency: 'TWD',
        counterAccountId: 'Card', counterAmount: '3200.00', targetBalance: null, note: 'Card bill',
        lines: [{ id: 'l1', amount: '3200.00', twdAmount: '3200.00', fxRate: null, categoryId: null, budgetItemId: null, note: null }],
      });
      http.expectOne(`${API}/fx-rates/last-used`).flush([]);
      http.expectOne(`${API}/accounts`).flush(accounts);
      await fixture.whenStable();
      const form = formOf<TransferPage['form']>(fixture);
      expect(form.getRawValue()).toMatchObject({ fromAccountId: 'Cash', toAccountId: 'Card', occurredOn: '2026-10-03', amount: '3200', note: 'Card bill' });

      form.patchValue({ amount: '3300' });
      await submit(fixture);
      const req = http.expectOne({ method: 'PUT', url: `${API}/records/t1` });
      expect(req.request.body).toMatchObject({ counterAmount: '3300', lines: [{ amount: '3300' }] });
      req.flush({});
      await fixture.whenStable();
      fixture.detectChanges();

      const button = () => fixture.nativeElement.querySelector('.danger button') as HTMLButtonElement;
      button().click();
      fixture.detectChanges();
      button().click();
      http.expectOne({ method: 'DELETE', url: `${API}/records/t1` }).flush(null);
      await fixture.whenStable();
      expect(leave).toHaveBeenLastCalledWith('/records', 'Entry deleted.');
    });
  });

  describe('AdjustPage', () => {
    it('adjusts to the actual balance with no lines', async () => {
      const fixture = setup(AdjustPage, { query: { account: 'USD' } });
      http.expectOne(`${API}/accounts`).flush(accounts);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('120.50');
      const form = formOf<AdjustPage['form']>(fixture);
      form.patchValue({ targetBalance: '118.75' });
      await submit(fixture);
      const req = http.expectOne((r) => r.method === 'PUT');
      expect(req.request.body).toEqual({
        type: 'adjustment',
        occurredOn: '2026-10-07',
        accountId: 'USD',
        currency: 'USD',
        targetBalance: '118.75',
        note: null,
        lines: [],
      });
      req.flush({});
      await fixture.whenStable();
      expect(leave).toHaveBeenCalledWith('/accounts', 'Balance adjusted.');
    });
  });
});
