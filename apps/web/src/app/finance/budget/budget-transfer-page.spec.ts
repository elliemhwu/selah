import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TODAY } from '../../core/today';
import type { DeviceSnapshot } from '../../data/device-storage';
import { deviceData, flushSaves, planItem, settle, storedTransfer, storedVersion } from '../../data/testing';
import { FormNavigation } from '../../ui/form-navigation';
import { Toast } from '../../ui/toast';
import { BudgetTransferPage } from './budget-transfer-page';

const plan = storedVersion('v1', '2026-09', [
  planItem('salary', { section: 'income', amount: '60000.00' }),
  planItem('allowance', { amount: '620.00', rollover: true, resetCycle: 'never' }),
  planItem('travel', { section: 'saving' }),
]);
const saved = storedTransfer('t1', {
  occurredOn: '2026-09-30',
  occurredAt: '21:00',
  fromItemId: 'allowance',
  toItemId: 'travel',
  amount: '500.00',
  note: 'spare',
});

describe('BudgetTransferPage', () => {
  let leave: ReturnType<typeof vi.fn>;

  async function render(route: { params?: Record<string, string>; query?: Record<string, string> } = {}, seed: Partial<DeviceSnapshot> = {}) {
    leave = vi.fn();
    const device = deviceData({ planVersions: [plan], ...seed });
    TestBed.configureTestingModule({
      imports: [BudgetTransferPage],
      providers: [
        ...device.providers,
        { provide: TODAY, useValue: () => '2026-10-14' },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(route.params ?? {}), queryParamMap: convertToParamMap(route.query ?? {}) } },
        },
        { provide: FormNavigation, useValue: { leave } },
        { provide: Toast, useValue: { show: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(BudgetTransferPage);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const form = (fixture.componentInstance as unknown as { form: BudgetTransferPage['form'] }).form;
    const submit = async () => {
      el.querySelector('form')?.dispatchEvent(new Event('submit'));
      await flushSaves();
      await fixture.whenStable();
    };
    return { fixture, el, form, submit, storage: device.storage };
  }

  it('moves a leftover, dated the last day of the previous month', async () => {
    const { el, form, submit, storage } = await render({ query: { from: 'allowance' } });
    expect(form.getRawValue()).toMatchObject({ occurredOn: '2026-09-30', fromItemId: 'allowance', toItemId: '' });
    expect(el.textContent).toContain('Left in this envelope that day: 620');
    // Income items are not budgets (ADR 0019); the others follow the plan's section order.
    const choices = [...el.querySelectorAll('#bt-to option')].map((o) => o.textContent?.trim());
    expect(choices).toEqual(['Choose a budget', 'travel', 'allowance']);

    form.patchValue({ toItemId: 'travel', amount: '500', note: ' Japan ' });
    await submit();
    expect(storage.snapshot().budgetTransfers).toEqual([
      expect.objectContaining({
        kind: 'manual',
        occurredOn: '2026-09-30',
        occurredAt: null,
        fromItemId: 'allowance',
        toItemId: 'travel',
        amount: '500.00',
        note: 'Japan',
      }),
    ]);
    expect(leave).toHaveBeenCalledWith('/finance/review', 'Budget moved.');
  });

  it('takes whole TWD only', async () => {
    const { form, submit, storage } = await render({ query: { from: 'allowance', to: 'travel' } });
    form.patchValue({ amount: '500.5' });
    await submit();
    expect(storage.snapshot().budgetTransfers).toEqual([]);
    expect(form.controls.amount.errors).toMatchObject({ whole: true });
  });

  it('shows a refused item on its field', async () => {
    const { form, submit } = await render({ query: { from: 'allowance', to: 'gone' } });
    form.patchValue({ amount: '500' });
    await submit();
    expect(form.controls.toItemId.errors).toEqual({ server: 'The budget item does not exist.' });
    expect(leave).not.toHaveBeenCalled();
  });

  it('edits a transfer, keeping its time, and deletes it after asking twice', async () => {
    const { fixture, el, form, submit, storage } = await render({ params: { id: 't1' } }, { budgetTransfers: [saved] });
    expect(form.getRawValue()).toEqual({ occurredOn: '2026-09-30', fromItemId: 'allowance', toItemId: 'travel', amount: '500', note: 'spare' });

    form.patchValue({ amount: '400' });
    await submit();
    expect(storage.snapshot().budgetTransfers[0]).toMatchObject({ id: 't1', occurredAt: '21:00', amount: '400.00' });

    fixture.detectChanges();
    const button = () => el.querySelector('.danger button') as HTMLButtonElement;
    button().click();
    fixture.detectChanges();
    expect(button().textContent).toContain('Tap again to delete this move');
    button().click();
    await flushSaves();
    expect(storage.snapshot().budgetTransfers[0].deletedAt).not.toBeNull();
    expect(leave).toHaveBeenLastCalledWith('/finance/review', 'Transfer deleted.');
  });
});
