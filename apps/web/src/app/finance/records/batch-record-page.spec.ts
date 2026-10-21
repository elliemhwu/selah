import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TODAY } from '../../core/today';
import type { MemoryStorage } from '../../data/device-storage';
import { deviceData, flushSaves, planItem, settle, storedAccount, storedVersion } from '../../data/testing';
import { FormNavigation } from '../../ui/form-navigation';
import { BatchRecordPage } from './batch-record-page';

const plan = storedVersion('v1', '2026-10', [
  planItem('salary', { section: 'income', amount: '60000.00' }),
  planItem('rent', { amount: '15000.00' }),
  planItem('power', { amount: '1200.00' }),
  planItem('tax', { section: 'government', amount: '3000.00' }),
]);

describe('BatchRecordPage', () => {
  let leave: ReturnType<typeof vi.fn>;
  let storage: MemoryStorage;

  async function render(items = 'salary,rent,power') {
    leave = vi.fn();
    const device = deviceData({
      accounts: [storedAccount('usd', 'USD', { name: 'USD' }), storedAccount('bank', 'TWD', { name: 'Bank' })],
      planVersions: [plan],
    });
    storage = device.storage;
    TestBed.configureTestingModule({
      imports: [BatchRecordPage],
      providers: [
        ...device.providers,
        { provide: TODAY, useValue: () => '2026-10-07' },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ items, date: '2026-10-05' }) } } },
        { provide: FormNavigation, useValue: { leave } },
      ],
    });
    const fixture = TestBed.createComponent(BatchRecordPage);
    await settle(fixture);
    const component = fixture.componentInstance as unknown as { form: BatchRecordPage['form'] };
    const submit = async () => {
      (fixture.nativeElement as HTMLElement).querySelector('form')?.dispatchEvent(new Event('submit'));
      await flushSaves();
      await fixture.whenStable();
    };
    return { fixture, component, submit };
  }

  it("builds rows from the day's checklist and saves the included ones in one batch", async () => {
    const { component, submit } = await render();
    expect(component.form.controls.accountId.value).toBe('bank'); // TWD accounts only
    expect(component.form.controls.occurredOn.value).toBe('2026-10-05');
    const rows = component.form.controls.rows.controls;
    expect(rows.map((r) => r.controls.amount.value)).toEqual(['60000', '15000', '1200']);

    rows[1].controls.include.setValue(false);
    rows[2].controls.amount.setValue('1342');
    await submit();

    const records = storage.snapshot().records;
    expect(records).toHaveLength(2);
    expect(records.find((r) => r.type === 'income')).toMatchObject({
      occurredOn: '2026-10-05',
      accountId: 'bank',
      currency: 'TWD',
      note: null,
      lines: [{ amount: '60000.00', budgetItemId: 'salary' }],
    });
    expect(records.find((r) => r.type === 'expense')).toMatchObject({ lines: [{ amount: '1342.00', budgetItemId: 'power' }] });
    expect(leave).toHaveBeenCalledWith('/finance', 'Saved 2 entries.');
  });

  it('puts errors on the row that was sent', async () => {
    const { component, submit } = await render();
    const rows = component.form.controls.rows.controls;
    rows[0].controls.include.setValue(false);
    rows[2].controls.amount.setValue('1342.5');
    await submit();
    expect(rows[2].controls.amount.errors).toEqual({ server: 'TWD amounts must be whole.' });
    expect(rows[1].controls.amount.errors).toBeNull();
    expect(storage.snapshot().records).toEqual([]);
  });

  it('says when the items are no longer on the checklist', async () => {
    const { fixture } = await render('gone');
    expect(fixture.nativeElement.textContent).toContain("These items aren't on this period's checklist any more.");
  });
});
