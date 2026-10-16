import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
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
import { Toast } from '../../ui/toast';
import { CatchUpPage } from './catch-up-page';

const accounts = [storedAccount('cash', 'TWD', { sortOrder: 0 }), storedAccount('yen', 'JPY', { sortOrder: 1 })];
const plan = storedVersion('v1', '2026-10', [planItem('salary', { section: 'income' }), planItem('food')]);
/** Gives JPY a last-used rate of 0.21. */
const yenPurchase = storedRecord('old', {
  accountId: 'yen',
  currency: 'JPY',
  occurredOn: '2026-10-01',
  lines: [storedLine('l0', '100.00', { twdAmount: '21.00', fxRate: '0.21' })],
});
const lunch = storedRecord('r0', {
  occurredOn: '2026-10-13',
  lines: [storedLine('l1', '185.00'), storedLine('l2', '60.00')],
});

describe('CatchUpPage', () => {
  let toast: { show: ReturnType<typeof vi.fn> };
  let storage: MemoryStorage;

  async function render(query: Record<string, string> = {}, records: StoredRecord[] = []) {
    toast = { show: vi.fn() };
    const device = deviceData({ accounts, planVersions: [plan], records: [yenPurchase, ...records] });
    storage = device.storage;
    TestBed.configureTestingModule({
      imports: [CatchUpPage],
      providers: [
        ...device.providers,
        { provide: TODAY, useValue: () => '2026-10-14' },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
        { provide: FormNavigation, useValue: { leave: vi.fn() } },
        { provide: Toast, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(CatchUpPage);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const form = (fixture.componentInstance as unknown as { form: CatchUpPage['form'] }).form;
    const page = fixture.componentInstance as unknown as { saveAndNextDay(): Promise<void>; addRow(): void };
    const row = (i: number) => form.controls.rows.at(i).controls;
    return { fixture, el, form, page, row };
  }
  /** Records saved by the page, without the seeded one. */
  const savedRecords = () => storage.snapshot().records.filter((r) => r.id !== 'old' && r.id !== 'r0');

  it('starts on yesterday and shows what is already recorded that day', async () => {
    const { el, form } = await render({}, [lunch]);
    expect(form.getRawValue()).toMatchObject({ occurredOn: '2026-10-13', accountId: 'cash', fxRate: '' });
    expect(el.querySelector('.recorded')?.textContent?.replace(/\s+/g, ' ')).toContain('already 1 entry, 245 spent');
  });

  it("saves the day's filled rows, then moves to the next day with an empty row", async () => {
    const { form, page, row } = await render({ date: '2026-10-12' });
    row(0).amount.setValue('185');
    row(0).budgetItemId.setValue('food');
    row(0).note.setValue(' bento ');
    page.addRow();
    row(1).amount.setValue('60');
    page.addRow(); // left empty: skipped
    const firstId = row(0).id.value;

    await page.saveAndNextDay();
    const saved = savedRecords();
    expect(saved).toHaveLength(2);
    expect(saved.find((r) => r.id === firstId)).toMatchObject({
      type: 'expense',
      occurredOn: '2026-10-12',
      accountId: 'cash',
      currency: 'TWD',
      note: 'bento',
      lines: [{ amount: '185.00', fxRate: null, budgetItemId: 'food', categoryId: null }],
    });
    expect(saved.find((r) => r.id !== firstId)).toMatchObject({ note: null, lines: [{ amount: '60.00', budgetItemId: null }] });
    expect(toast.show).toHaveBeenCalledWith('Saved 2 entries.');
    expect(form.getRawValue()).toMatchObject({ occurredOn: '2026-10-13', accountId: 'cash' });
    expect(form.controls.rows.length).toBe(1);
    expect(row(0).amount.value).toBe('');
    expect(row(0).id.value).not.toBe(firstId);
  });

  it('just moves on from a day with nothing to add', async () => {
    const { page, form } = await render({ date: '2026-10-12' });
    await page.saveAndNextDay();
    expect(savedRecords()).toEqual([]);
    expect(toast.show).not.toHaveBeenCalled();
    expect(form.controls.occurredOn.value).toBe('2026-10-13');
  });

  it('enters a foreign account in its currency with the day rate', async () => {
    const { form, page, row } = await render({ date: '2026-10-12', account: 'yen' });
    expect(form.controls.fxRate.value).toBe('0.21');
    row(0).type.setValue('income');
    row(0).amount.setValue('3000');
    await page.saveAndNextDay();
    expect(savedRecords()[0]).toMatchObject({
      type: 'income',
      accountId: 'yen',
      currency: 'JPY',
      lines: [{ amount: '3000.00', fxRate: '0.21000000', twdAmount: '630.00' }],
    });
  });

  it('shows a refused row on its field and keeps the day', async () => {
    const { fixture, el, form, page, row } = await render({ date: '2026-10-12' });
    // Add the row as a user does, so it is on screen before anything is typed in it.
    (el.querySelector('.add-row') as HTMLButtonElement).click();
    fixture.detectChanges();
    row(1).amount.setValue('99.5');
    await page.saveAndNextDay();
    fixture.detectChanges();
    await flushSaves();
    expect(row(1).amount.errors).toEqual({ server: 'TWD amounts must be whole.' });
    expect(form.controls.occurredOn.value).toBe('2026-10-12');
    expect(savedRecords()).toEqual([]);
  });

  it("doesn't go past today", async () => {
    const { el } = await render({ date: '2026-10-14' });
    expect(el.querySelector('.next-day')).toBeNull();
    expect((el.querySelector('[aria-label="Next day"]') as HTMLButtonElement).disabled).toBe(true);
  });
});
