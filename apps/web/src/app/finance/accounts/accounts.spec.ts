import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { TODAY } from '../../core/today';
import type { AccountDto } from '../data/finance-api';
import { AccountDialog } from './account-dialog';
import { AccountsPage } from './accounts-page';
import { AdjustDialog } from './adjust-dialog';
import { TransferDialog } from './transfer-dialog';

const API = '/api/v1/finance';
const account = (id: string, currency: AccountDto['currency'], balance: string, type: AccountDto['type'] = 'cash') =>
  ({ id, name: id, type, currency, openingBalance: '0.00', balance, sortOrder: 0 }) as AccountDto;
const accounts = [account('Cash', 'TWD', '1500.00'), account('Card', 'TWD', '-3200.00', 'credit_card'), account('USD', 'USD', '120.50', 'bank')];

function providers(extra: unknown[] = []) {
  return [provideHttpClient(), provideHttpClientTesting(), { provide: TODAY, useValue: () => '2026-10-07' }, ...extra];
}

async function submit(fixture: { nativeElement: HTMLElement; whenStable: () => Promise<unknown> }) {
  fixture.nativeElement.querySelector('form')?.dispatchEvent(new Event('submit'));
  await fixture.whenStable();
}

describe('AccountsPage', () => {
  let http: HttpTestingController;
  let open: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    open = vi.fn(() => ({ closed: of(undefined) }));
    TestBed.configureTestingModule({ imports: [AccountsPage], providers: providers([{ provide: Dialog, useValue: { open } }]) });
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

  it('opens the dialogs', async () => {
    const el = await render(accounts);
    el.querySelector<HTMLButtonElement>('.account')?.click();
    expect(open).toHaveBeenLastCalledWith(AccountDialog, expect.objectContaining({ data: { account: accounts[0] } }));
    const button = (text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
    button('Transfer')?.click();
    expect(open).toHaveBeenLastCalledWith(TransferDialog, expect.objectContaining({ data: { accounts } }));
    button('Adjust balance')?.click();
    expect(open).toHaveBeenLastCalledWith(AdjustDialog, expect.objectContaining({ data: { accounts } }));
    button('New account')?.click();
    expect(open).toHaveBeenLastCalledWith(AccountDialog, expect.objectContaining({ data: {} }));
  });

  it('invites a first account', async () => {
    const el = await render([]);
    expect(el.textContent).toContain('No accounts yet.');
    expect([...el.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual(['New account']);
  });
});

describe('AccountDialog', () => {
  let http: HttpTestingController;
  let close: ReturnType<typeof vi.fn>;

  function setup(data: object) {
    close = vi.fn();
    TestBed.configureTestingModule({
      imports: [AccountDialog],
      providers: providers([{ provide: DIALOG_DATA, useValue: data }, { provide: DialogRef, useValue: { close } }]),
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AccountDialog);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance as unknown as { form: AccountDialog['form'] } };
  }
  afterEach(() => http.verify());

  it('creates an account with a negative opening balance', async () => {
    const { fixture, component } = setup({});
    component.form.patchValue({ name: ' Card ', type: 'credit_card', openingBalance: '-3200' });
    await submit(fixture);
    const req = http.expectOne((r) => r.method === 'PUT' && r.url.startsWith(`${API}/accounts/`));
    expect(req.request.body).toEqual({ name: 'Card', type: 'credit_card', currency: 'TWD', openingBalance: '-3200', sortOrder: 0 });
    req.flush({});
    await fixture.whenStable();
    expect(close).toHaveBeenCalledWith('saved');
  });

  it('edits in place and shows a refused currency change on its field', async () => {
    const { fixture, component } = setup({ account: accounts[0] });
    expect(component.form.getRawValue()).toMatchObject({ name: 'Cash', openingBalance: '0' });
    component.form.patchValue({ currency: 'JPY' });
    await submit(fixture);
    http.expectOne(`${API}/accounts/Cash`).flush(
      { status: 422, errors: { currency: ["The currency can't change once the account has records."] } },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await fixture.whenStable();
    expect(component.form.controls.currency.errors).toEqual({ server: "The currency can't change once the account has records." });
  });

  it('asks twice before deleting', async () => {
    const { fixture } = setup({ account: accounts[0] });
    const button = () => fixture.nativeElement.querySelector('.danger button') as HTMLButtonElement;
    button().click();
    fixture.detectChanges();
    expect(button().textContent).toContain('Tap again to delete Cash');
    http.expectNone({ method: 'DELETE' });
    button().click();
    http.expectOne({ method: 'DELETE', url: `${API}/accounts/Cash` }).flush(null);
    await fixture.whenStable();
    expect(close).toHaveBeenCalledWith('deleted');
  });
});

describe('TransferDialog and AdjustDialog', () => {
  let http: HttpTestingController;
  let close: ReturnType<typeof vi.fn>;

  function setup<T>(component: Type<T>, data: object) {
    close = vi.fn();
    TestBed.configureTestingModule({
      imports: [component],
      providers: providers([{ provide: DIALOG_DATA, useValue: data }, { provide: DialogRef, useValue: { close } }]),
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    return fixture;
  }
  afterEach(() => http.verify());

  it('transfers between TWD accounts with one amount', async () => {
    const fixture = setup(TransferDialog, { accounts });
    http.expectOne(`${API}/fx-rates/last-used`).flush([]);
    const form = (fixture.componentInstance as unknown as { form: TransferDialog['form'] }).form;
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
    req.flush({ id: 't' });
    await fixture.whenStable();
    expect(close).toHaveBeenCalledWith({ id: 't' });
  });

  it('asks for the amount received and the rate in an exchange', async () => {
    const fixture = setup(TransferDialog, { accounts, fromAccountId: 'USD' });
    http.expectOne(`${API}/fx-rates/last-used`).flush([{ currency: 'USD', rate: '32.1', occurredOn: '2026-10-01' }]);
    await fixture.whenStable();
    const form = (fixture.componentInstance as unknown as { form: TransferDialog['form'] }).form;
    expect(form.controls.fxRate.value).toBe('32.1');
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

  it('adjusts to the actual balance with no lines', async () => {
    const fixture = setup(AdjustDialog, { accounts, accountId: 'USD' });
    expect(fixture.nativeElement.textContent).toContain('120.50');
    const form = (fixture.componentInstance as unknown as { form: AdjustDialog['form'] }).form;
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
  });
});
