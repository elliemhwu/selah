import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import type { Currency } from '@selah/shared-types';
import { TODAY } from '../../core/today';
import type { MemoryStorage, StoredRecord } from '../../data/device-storage';
import {
  deviceData,
  flushSaves,
  planItem,
  settle,
  storedAccount,
  storedLine,
  storedRecord,
  storedVersion,
} from '../../data/testing';
import { FormNavigation } from '../../ui/form-navigation';
import { RecordFormPage } from './record-form-page';

const accounts = [storedAccount('cash', 'TWD', { sortOrder: 0 }), storedAccount('usd', 'USD', { sortOrder: 1 })];
const plan = storedVersion('v1', '2026-10', [
  planItem('salary', { section: 'income' }),
  planItem('rent'),
  planItem('food'),
]);
/** Gives USD a last-used rate of 32.5. */
const usdPurchase = storedRecord('old', {
  accountId: 'usd',
  currency: 'USD',
  occurredOn: '2026-10-01',
  lines: [storedLine('l0', '1.00', { twdAmount: '33.00', fxRate: '32.5' })],
});
const saved = storedRecord('r1', {
  occurredOn: '2026-10-05',
  occurredAt: '12:30',
  note: 'Market',
  lines: [storedLine('l1', '150.00', { budgetItemId: 'food', note: 'Veg' }), storedLine('l2', '80.00', { budgetItemId: 'rent' })],
});

describe('RecordFormPage', () => {
  let leave: ReturnType<typeof vi.fn>;
  let storage: MemoryStorage;

  async function render(
    route: { query?: Record<string, string>; params?: Record<string, string> } = {},
    { records = [] as StoredRecord[], defaultCurrency = 'TWD' as Currency } = {},
  ) {
    leave = vi.fn();
    const device = deviceData({
      accounts,
      planVersions: [plan],
      records: [usdPurchase, ...records],
      settings: { id: 'settings', weekStartDay: 1, defaultCurrency, updatedAt: 'x' },
    });
    storage = device.storage;
    TestBed.configureTestingModule({
      imports: [RecordFormPage],
      providers: [
        ...device.providers,
        { provide: TODAY, useValue: () => '2026-10-07' },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(route.query ?? {}), paramMap: convertToParamMap(route.params ?? {}) } },
        },
        { provide: FormNavigation, useValue: { leave } },
      ],
    });
    const fixture = TestBed.createComponent(RecordFormPage);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const component = fixture.componentInstance as unknown as { form: RecordFormPage['form'] };
    const submit = async () => {
      el.querySelector('form')?.dispatchEvent(new Event('submit'));
      await flushSaves();
      await fixture.whenStable();
    };
    return { fixture, el, submit, form: component.form, line: (i: number) => component.form.controls.lines.at(i).controls };
  }
  /** Records saved by the form, without the seeded ones. */
  const savedRecords = () => storage.snapshot().records.filter((r) => r.id !== 'old');

  it('saves an expense on the first account, then leaves the form', async () => {
    const { el, submit, line } = await render();
    const amount = el.querySelector<HTMLInputElement>('#rec-amount') as HTMLInputElement;
    amount.value = '150';
    amount.dispatchEvent(new Event('input'));
    const note = el.querySelector<HTMLInputElement>('#rec-note') as HTMLInputElement;
    note.value = 'lunch';
    note.dispatchEvent(new Event('input'));
    const lineId = line(0).id.value;
    await submit();
    expect(savedRecords()).toEqual([
      expect.objectContaining({
        type: 'expense',
        occurredOn: '2026-10-07',
        occurredAt: null,
        accountId: 'cash',
        currency: 'TWD',
        note: 'lunch',
        lines: [{ id: lineId, amount: '150.00', twdAmount: '150.00', fxRate: null, budgetItemId: null, categoryId: null, note: null }],
      }),
    ]);
    expect(leave).toHaveBeenCalledWith('/', 'Saved.');
  });

  it('starts from a checklist item and keeps the ids when saving again', async () => {
    const { submit, form, line } = await render({ query: { type: 'income', item: 'salary', amount: '60000.00' } });
    expect(form.controls.type.value).toBe('income');
    expect(line(0).budgetItemId.value).toBe('salary');
    expect(line(0).amount.value).toBe('60000');

    line(0).amount.setValue('60000.5');
    await submit();
    expect(line(0).amount.errors).toEqual({ server: 'TWD amounts must be whole.' });
    expect(savedRecords()).toEqual([]);

    const lineId = line(0).id.value;
    line(0).amount.setValue('59000');
    await submit();
    const [record] = savedRecords();
    expect(record).toMatchObject({ type: 'income', lines: [{ id: lineId, amount: '59000.00', budgetItemId: 'salary' }] });
  });

  it('splits a receipt into lines and shows the total', async () => {
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
    expect(savedRecords()[0].lines.map((l) => [l.amount, l.budgetItemId])).toEqual([
      ['150.00', 'food'],
      ['80.00', 'rent'],
    ]);
  });

  it('edits a saved record, keeping its line ids, and deletes it after a second tap', async () => {
    const { el, fixture, form, line, submit } = await render({ params: { id: 'r1' } }, { records: [saved] });
    expect(form.getRawValue()).toMatchObject({ occurredOn: '2026-10-05', occurredAt: '12:30', note: 'Market' });
    expect(form.controls.lines.length).toBe(2);
    expect(line(0).note.value).toBe('Veg');

    line(1).amount.setValue('90');
    await submit();
    expect(savedRecords()[0].lines.map((l) => [l.id, l.amount])).toEqual([
      ['l1', '150.00'],
      ['l2', '90.00'],
    ]);
    expect(leave).toHaveBeenCalledWith('/records', 'Saved.');
    fixture.detectChanges(); // the button is enabled again once saving ends

    const button = () => el.querySelector('.danger button') as HTMLButtonElement;
    button().click();
    fixture.detectChanges();
    expect(button().textContent).toContain('Tap again');
    button().click();
    await flushSaves();
    expect(savedRecords()[0].deletedAt).not.toBeNull();
    expect(leave).toHaveBeenLastCalledWith('/records', 'Entry deleted.');
  });

  it('sends transfers to their own form', async () => {
    const transfer = storedRecord('t1', { type: 'transfer', counterAccountId: 'usd', counterAmount: '1.00', lines: [storedLine('l1', '33.00')] });
    const navigate = vi.spyOn(Router.prototype, 'navigate').mockResolvedValue(true);
    await render({ params: { id: 't1' } }, { records: [transfer] });
    expect(navigate).toHaveBeenCalledWith(['/accounts', 'transfer', 't1'], { replaceUrl: true });
    navigate.mockRestore();
  });

  it('drops a budget item that does not fit the record type', async () => {
    const { line } = await render({ query: { item: 'salary' } });
    expect(line(0).budgetItemId.value).toBe('');
  });

  it('pre-fills the last rate for a foreign currency and needs one to save', async () => {
    const { form, line, submit, fixture } = await render();
    form.controls.accountId.setValue('usd');
    fixture.detectChanges();
    expect(form.controls.currency.value).toBe('USD');
    expect(form.controls.fxRate.value).toBe('32.5');

    line(0).amount.setValue('10');
    form.controls.fxRate.setValue('');
    await submit();
    expect(savedRecords()).toEqual([]);
    expect(form.controls.fxRate.errors).toEqual({ required: true });
  });

  it('starts a new entry in the default currency, with its last rate', async () => {
    const { form, fixture } = await render({}, { defaultCurrency: 'USD' });
    // The first account is TWD, which takes a USD entry (ADR 0016).
    expect(form.getRawValue()).toMatchObject({ accountId: 'cash', currency: 'USD', fxRate: '32.5' });

    form.controls.accountId.setValue('usd');
    fixture.detectChanges();
    expect(form.controls.currency.value).toBe('USD');
  });

  it('keeps the currency of an entry being edited', async () => {
    const { form } = await render({ params: { id: 'r1' } }, { records: [saved], defaultCurrency: 'USD' });
    expect(form.controls.currency.value).toBe('TWD');
  });
});
