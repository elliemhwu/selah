import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TODAY } from '../../core/today';
import type { DeviceSnapshot } from '../../data/device-storage';
import { deviceData, flushSaves, settle, storedAccount, storedLine, storedRecord } from '../../data/testing';
import { FormNavigation } from '../../ui/form-navigation';
import { AccountFormPage } from './account-form-page';
import { AccountsPage } from './accounts-page';
import { AdjustPage } from './adjust-page';
import { TransferPage } from './transfer-page';

// Balances are derived (ADR 0011); here they come from the opening balances.
const accounts = [
  storedAccount('Cash', 'TWD', { openingBalance: '1500.00', sortOrder: 0 }),
  storedAccount('Card', 'TWD', { openingBalance: '-3200.00', type: 'credit_card', sortOrder: 1 }),
  storedAccount('USD', 'USD', { openingBalance: '120.50', type: 'bank', sortOrder: 2 }),
];

async function submit(fixture: { nativeElement: HTMLElement; whenStable: () => Promise<unknown> }) {
  fixture.nativeElement.querySelector('form')?.dispatchEvent(new Event('submit'));
  await flushSaves();
  await fixture.whenStable();
}

describe('AccountsPage', () => {
  async function render(seed: Partial<DeviceSnapshot>) {
    TestBed.configureTestingModule({
      imports: [AccountsPage],
      providers: [provideRouter([]), ...deviceData(seed).providers],
    });
    const fixture = TestBed.createComponent(AccountsPage);
    await settle(fixture);
    return fixture.nativeElement as HTMLElement;
  }

  it('lists balances and a total per currency', async () => {
    const el = await render({ accounts: [...accounts, storedAccount('Closed', 'TWD', { deletedAt: 'x' })] });
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

  it('derives a balance from the records', async () => {
    const lunch = storedRecord('r1', { accountId: 'Cash', lines: [storedLine('l1', '185.00')] });
    const el = await render({ accounts: [accounts[0]], records: [lunch] });
    expect(el.querySelector('.balance')?.textContent).toContain('1,315');
  });

  it('links to the account forms', async () => {
    const el = await render({ accounts });
    expect(el.querySelector('.account')?.getAttribute('href')).toBe('/finance/accounts/Cash');
    const hrefs = [...el.querySelectorAll('.actions a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/finance/accounts/transfer', '/finance/accounts/adjust', '/finance/accounts/new']);
  });

  it('invites a first account', async () => {
    const el = await render({});
    expect(el.textContent).toContain('No accounts yet.');
    expect([...el.querySelectorAll('.actions a')].map((a) => a.textContent?.trim())).toEqual(['New account']);
  });
});

describe('account form pages', () => {
  let leave: ReturnType<typeof vi.fn>;

  async function setup<T, F = unknown>(
    component: Type<T>,
    seed: Partial<DeviceSnapshot> = { accounts },
    route: { params?: Record<string, string>; query?: Record<string, string> } = {},
  ) {
    leave = vi.fn();
    const device = deviceData(seed);
    TestBed.configureTestingModule({
      imports: [component],
      providers: [
        ...device.providers,
        { provide: TODAY, useValue: () => '2026-10-07' },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(route.params ?? {}), queryParamMap: convertToParamMap(route.query ?? {}) } },
        },
        { provide: FormNavigation, useValue: { leave } },
      ],
    });
    const fixture = TestBed.createComponent(component);
    await settle(fixture);
    const form = (fixture.componentInstance as unknown as { form: F }).form;
    return { fixture, form, storage: device.storage };
  }

  describe('AccountFormPage', () => {
    it('creates an account with a negative opening balance', async () => {
      const { fixture, form, storage } = await setup<AccountFormPage, AccountFormPage['form']>(AccountFormPage, {});
      form.patchValue({ name: ' Card ', type: 'credit_card', openingBalance: '-3200' });
      await submit(fixture);
      expect(storage.snapshot().accounts).toEqual([
        expect.objectContaining({ name: 'Card', type: 'credit_card', currency: 'TWD', openingBalance: '-3200.00', sortOrder: 0, deletedAt: null }),
      ]);
      expect(leave).toHaveBeenCalledWith('/finance/accounts', 'Account saved.');
    });

    it('starts a new account in the default currency', async () => {
      const { form } = await setup<AccountFormPage, AccountFormPage['form']>(AccountFormPage, {
        settings: { id: 'settings', weekStartDay: 1, defaultCurrency: 'JPY', updatedAt: 'x' },
      });
      expect(form.controls.currency.value).toBe('JPY');
    });

    it('refuses a second account with the same name', async () => {
      const { fixture, form, storage } = await setup<AccountFormPage, AccountFormPage['form']>(AccountFormPage);
      form.patchValue({ name: 'Cash' });
      await submit(fixture);
      expect(storage.snapshot().accounts).toHaveLength(3);
      expect(leave).not.toHaveBeenCalled();
    });

    it('loads the account to edit and shows a refused currency change on its field', async () => {
      const used = storedRecord('r1', { accountId: 'Cash', lines: [storedLine('l1', '10.00')] });
      const { fixture, form } = await setup<AccountFormPage, AccountFormPage['form']>(AccountFormPage, { accounts, records: [used] }, { params: { id: 'Cash' } });
      expect(form.getRawValue()).toEqual({ name: 'Cash', type: 'cash', currency: 'TWD', openingBalance: '1500' });

      form.patchValue({ currency: 'JPY' });
      await submit(fixture);
      expect(form.controls.currency.errors).toEqual({ server: "The currency can't change once the account has records." });
      expect(leave).not.toHaveBeenCalled();
    });

    it('says when the account does not exist', async () => {
      const { fixture } = await setup<AccountFormPage, AccountFormPage['form']>(AccountFormPage, { accounts }, { params: { id: 'gone' } });
      expect(fixture.nativeElement.textContent).toContain("This account isn't in the ledger.");
    });

    it('asks twice before deleting', async () => {
      const { fixture, storage } = await setup<AccountFormPage, AccountFormPage['form']>(AccountFormPage, { accounts }, { params: { id: 'Cash' } });
      const button = () => fixture.nativeElement.querySelector('.danger button') as HTMLButtonElement;
      button().click();
      fixture.detectChanges();
      expect(button().textContent).toContain('Tap again to delete Cash');
      expect(storage.snapshot().accounts[0].deletedAt).toBeNull();
      button().click();
      await flushSaves();
      expect(storage.snapshot().accounts[0].deletedAt).not.toBeNull();
      expect(leave).toHaveBeenCalledWith('/finance/accounts', 'Account deleted.');
    });

    it('cancels back to the accounts', async () => {
      const { fixture } = await setup<AccountFormPage, AccountFormPage['form']>(AccountFormPage, {});
      (fixture.nativeElement.querySelector('.form-header .btn-quiet') as HTMLButtonElement).click();
      expect(leave).toHaveBeenCalledWith('/finance/accounts');
    });
  });

  describe('TransferPage', () => {
    const rate = storedRecord('old', {
      accountId: 'USD',
      currency: 'USD',
      occurredOn: '2026-10-01',
      lines: [storedLine('l0', '1.00', { twdAmount: '32.00', fxRate: '32.10000000' })],
    });

    it('transfers between TWD accounts with one amount', async () => {
      const { fixture, form, storage } = await setup<TransferPage, TransferPage['form']>(TransferPage);
      expect(form.getRawValue()).toMatchObject({ fromAccountId: 'Cash', toAccountId: 'Card' });
      form.patchValue({ amount: '3200' });
      await submit(fixture);
      expect(storage.snapshot().records).toEqual([
        expect.objectContaining({
          type: 'transfer',
          accountId: 'Cash',
          currency: 'TWD',
          counterAccountId: 'Card',
          counterAmount: '3200.00',
          lines: [expect.objectContaining({ amount: '3200.00', twdAmount: '3200.00' })],
        }),
      ]);
      expect(leave).toHaveBeenCalledWith('/finance/accounts', 'Transfer saved.');
    });

    it('asks for the amount received and the rate in an exchange', async () => {
      const { fixture, form, storage } = await setup<TransferPage, TransferPage['form']>(TransferPage, { accounts, records: [rate] }, { query: { from: 'USD' } });
      expect(form.getRawValue()).toMatchObject({ fromAccountId: 'USD', toAccountId: 'Cash', fxRate: '32.10000000' });
      form.patchValue({ amount: '100' });
      await submit(fixture);
      expect(form.controls.counterAmount.errors).toEqual({ required: true });
      expect(storage.snapshot().records).toHaveLength(1);

      form.patchValue({ counterAmount: '3205' });
      await submit(fixture);
      expect(storage.snapshot().records.find((r) => r.type === 'transfer')).toMatchObject({
        accountId: 'USD',
        currency: 'USD',
        counterAccountId: 'Cash',
        counterAmount: '3205.00',
        lines: [{ amount: '100.00', fxRate: '32.10000000', twdAmount: '3210.00' }],
      });
    });
  });

  describe('editing transfers and adjustments', () => {
    it('loads a transfer, saves it under the same id, and deletes it after a second tap', async () => {
      const transfer = storedRecord('t1', {
        type: 'transfer',
        occurredOn: '2026-10-03',
        accountId: 'Cash',
        counterAccountId: 'Card',
        counterAmount: '3200.00',
        note: 'Card bill',
        lines: [storedLine('l1', '3200.00')],
      });
      const { fixture, form, storage } = await setup<TransferPage, TransferPage['form']>(TransferPage, { accounts, records: [transfer] }, { params: { id: 't1' } });
      expect(form.getRawValue()).toMatchObject({ fromAccountId: 'Cash', toAccountId: 'Card', occurredOn: '2026-10-03', amount: '3200', note: 'Card bill' });

      form.patchValue({ amount: '3300' });
      await submit(fixture);
      expect(storage.snapshot().records).toEqual([
        expect.objectContaining({ id: 't1', counterAmount: '3300.00', lines: [expect.objectContaining({ id: 'l1', amount: '3300.00' })] }),
      ]);
      fixture.detectChanges();

      const button = () => fixture.nativeElement.querySelector('.danger button') as HTMLButtonElement;
      button().click();
      fixture.detectChanges();
      button().click();
      await flushSaves();
      expect(storage.snapshot().records[0].deletedAt).not.toBeNull();
      expect(leave).toHaveBeenLastCalledWith('/finance/records', 'Entry deleted.');
    });
  });

  describe('AdjustPage', () => {
    it('adjusts to the actual balance with no lines', async () => {
      const { fixture, form, storage } = await setup<AdjustPage, AdjustPage['form']>(AdjustPage, { accounts }, { query: { account: 'USD' } });
      expect(fixture.nativeElement.textContent).toContain('120.50');
      form.patchValue({ targetBalance: '118.75' });
      await submit(fixture);
      expect(storage.snapshot().records).toEqual([
        expect.objectContaining({
          type: 'adjustment',
          occurredOn: '2026-10-07',
          accountId: 'USD',
          currency: 'USD',
          targetBalance: '118.75',
          note: null,
          lines: [],
        }),
      ]);
      expect(leave).toHaveBeenCalledWith('/finance/accounts', 'Balance adjusted.');
    });
  });
});
