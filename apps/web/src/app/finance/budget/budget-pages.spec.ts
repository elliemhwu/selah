import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { TODAY } from '../../core/today';
import type { DeviceSnapshot, MemoryStorage } from '../../data/device-storage';
import { deviceData, flushSaves, settle, storedVersion } from '../../data/testing';
import { FormNavigation } from '../../ui/form-navigation';
import type { PlanVersionDto } from '../data/finance-api';
import { BudgetItemPage } from './budget-item-page';
import { BudgetPage } from './budget-page';
import { BudgetVersionsPage } from './budget-versions-page';
import { PlanDraft } from './plan-draft';
import { planItem } from './plan-item.testing';

const version: PlanVersionDto = {
  id: 'v2',
  effectiveFromMonth: '2026-10',
  note: null,
  editable: true,
  items: [
    planItem('salary', { section: 'income', name: 'Salary', amount: '60000.00' }),
    planItem('tax', { section: 'government', name: 'Tax', anchor: 'percent', amount: null, percent: '5.0000', percentBase: 'gross_income' }),
    planItem('food', { name: 'Food', anchor: 'percent', amount: null, percent: '12.5000' }),
    planItem('daily', {
      name: 'Daily Food', parentItemId: 'food', cadence: 'daily', amount: '185.00',
      rollover: true, resetCycle: 'week', onReset: 'carry', carryToItemId: 'allowance',
    }),
    planItem('allowance', { name: 'Allowance', cadence: 'weekly', amount: '500.00', rollover: true, resetCycle: 'never' }),
  ],
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};
const { editable: _, ...fields } = version;
const stored = storedVersion(version.id, version.effectiveFromMonth, version.items, fields);

describe('budget pages', () => {
  let leave: ReturnType<typeof vi.fn>;
  let storage: MemoryStorage;

  function setup<T>(
    component: Type<T>,
    route: { params?: Record<string, string>; query?: Record<string, string> } = {},
    seed: Partial<DeviceSnapshot> = { planVersions: [stored] },
  ) {
    localStorage.clear();
    leave = vi.fn();
    const device = deviceData(seed);
    storage = device.storage;
    TestBed.configureTestingModule({
      imports: [component],
      providers: [
        ...device.providers,
        provideRouter([]),
        { provide: TODAY, useValue: () => '2026-10-07' },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(route.params ?? {}), queryParamMap: convertToParamMap(route.query ?? {}) } },
        },
        { provide: FormNavigation, useValue: { leave } },
      ],
    });
  }

  async function render<T>(component: Type<T>) {
    const fixture = TestBed.createComponent(component);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  describe('BudgetPage', () => {
    it('shows the active plan for the month with net income and unallocated', async () => {
      setup(BudgetPage);
      const { el } = await render(BudgetPage);
      expect(el.querySelector('.base-amount')?.textContent).toContain('57,000');
      const names = [...el.querySelectorAll('.item-name')].map((n) => n.textContent?.trim());
      expect(names).toEqual(['Salary', 'Tax', 'Food', 'Daily Food', 'Allowance']);
      expect(el.textContent).toContain('185 a day · rolls, resets weekly → Allowance');
      expect(el.textContent).toContain('12.5% of net income');
      // 57,000 − 7,125 Food − 2,167 Allowance
      expect(el.querySelector('.unallocated-amount')?.textContent).toContain('47,708');
      expect(el.querySelector('.draft-bar')).toBeNull();
      expect(el.querySelectorAll('a.item')).toHaveLength(0);
    });

    it('edits: starts a draft, links items, and saves the whole plan', async () => {
      setup(BudgetPage);
      const { fixture, el } = await render(BudgetPage);
      [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Edit this plan'))?.click();
      fixture.detectChanges();
      expect(el.querySelector('.draft-bar')?.textContent).toContain('no changes yet');
      expect(el.querySelector('a.item')?.getAttribute('href')).toBe('/finance/budget/items/salary');

      const draft = TestBed.inject(PlanDraft);
      draft.putItem({ ...version.items[0], amount: '62000.00' });
      fixture.detectChanges();
      expect(el.querySelector('.draft-bar')?.textContent).toContain('1 changes not saved');
      expect(el.querySelector('.tag')?.textContent).toContain('Edited');

      [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Save plan'))?.click();
      await flushSaves();
      expect(storage.snapshot().planVersions[0].items[0].amount).toBe('62000.00');
      // Saving clears the draft; the page shows the saved plan.
      expect(draft.state()).toBeNull();
      fixture.detectChanges();
      expect(el.querySelector('.draft-bar')).toBeNull();
      expect(el.querySelector('.base-amount')?.textContent).toContain('58,900'); // 62,000 − 5% tax
    });

    it('offers a first plan when none covers the month', async () => {
      setup(BudgetPage, {}, {});
      const { fixture, el } = await render(BudgetPage);
      expect(el.textContent).toContain('No plan covers this month.');
      [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Start a plan'))?.click();
      fixture.detectChanges();
      expect(TestBed.inject(PlanDraft).state()).toMatchObject({ effectiveFromMonth: '2026-10', items: [], isNew: true });
      expect(el.querySelectorAll('.add')).toHaveLength(5);
    });
  });

  describe('BudgetItemPage', () => {
    it('edits an item into the draft', async () => {
      setup(BudgetItemPage, { params: { id: 'daily' } });
      TestBed.inject(PlanDraft).edit(version);
      const { fixture, el } = await render(BudgetItemPage);
      const form = (fixture.componentInstance as unknown as { form: BudgetItemPage['form'] }).form;
      expect(form.getRawValue()).toMatchObject({ name: 'Daily Food', cadence: 'daily', amount: '185', rollover: true, resetCycle: 'week', onReset: 'carry' });
      expect(el.textContent).toContain('October:');
      expect(el.querySelector('#bi-anchor-percent')?.hasAttribute('disabled')).toBe(true);

      form.patchValue({ amount: '200' });
      el.querySelector('form')?.dispatchEvent(new Event('submit'));
      expect(TestBed.inject(PlanDraft).item('daily')).toMatchObject({ amount: '200.00', resetCycle: 'week', carryToItemId: 'allowance' });
      expect(leave).toHaveBeenCalledWith('/finance/budget');
    });

    it('adds a new item to the section asked for', async () => {
      setup(BudgetItemPage, { params: { id: 'new' }, query: { section: 'saving' } });
      TestBed.inject(PlanDraft).edit(version);
      const { fixture, el } = await render(BudgetItemPage);
      const form = (fixture.componentInstance as unknown as { form: BudgetItemPage['form'] }).form;
      form.patchValue({ name: 'Japan trip', cadence: 'one_time', cadenceDate: '2026-12-20', amount: '30000' });
      el.querySelector('form')?.dispatchEvent(new Event('submit'));
      const added = TestBed.inject(PlanDraft).state()?.items.at(-1);
      expect(added).toMatchObject({ section: 'saving', name: 'Japan trip', cadence: 'one_time', cadenceDate: '2026-12-20', amount: '30000.00', rollover: false });
    });

    it('explains what is missing instead of closing', async () => {
      setup(BudgetItemPage, { params: { id: 'new' }, query: { section: 'expense' } });
      TestBed.inject(PlanDraft).edit(version);
      const { fixture, el } = await render(BudgetItemPage);
      el.querySelector('form')?.dispatchEvent(new Event('submit'));
      fixture.detectChanges();
      expect(el.textContent).toContain('Give the item a name.');
      expect(leave).not.toHaveBeenCalled();
    });

    it('removes an item and the ones under it after a second tap', async () => {
      setup(BudgetItemPage, { params: { id: 'food' } });
      TestBed.inject(PlanDraft).edit(version);
      const { fixture, el } = await render(BudgetItemPage);
      const button = () => el.querySelector('.danger button') as HTMLButtonElement;
      button().click();
      fixture.detectChanges();
      expect(button().textContent).toContain('Tap again to remove it and 1 items under it');
      button().click();
      expect(TestBed.inject(PlanDraft).state()?.items.map((i) => i.budgetItemId)).toEqual(['salary', 'tax', 'allowance']);
    });

    it('says when there is no draft', async () => {
      setup(BudgetItemPage, { params: { id: 'food' } });
      const { el } = await render(BudgetItemPage);
      expect(el.textContent).toContain("This item isn't in the plan you're editing.");
    });
  });

  describe('BudgetVersionsPage', () => {
    it('lists versions newest first and starts a new one from the newest', async () => {
      const first = storedVersion('v1', '2026-01', version.items.slice(0, 4), { note: 'First plan' });
      setup(BudgetVersionsPage, {}, { planVersions: [stored, first] });
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const { fixture, el } = await render(BudgetVersionsPage);
      const ranges = [...el.querySelectorAll('.range')].map((r) => r.textContent?.replace(/\s+/g, ' ').trim());
      expect(ranges).toEqual(['Oct 2026 →', 'Jan 2026 – Sep 2026']);

      const form = (fixture.componentInstance as unknown as { form: BudgetVersionsPage['form'] }).form;
      form.patchValue({ month: '2027-01', note: 'New job' });
      el.querySelector('form')?.dispatchEvent(new Event('submit'));
      expect(TestBed.inject(PlanDraft).state()).toMatchObject({ effectiveFromMonth: '2027-01', note: 'New job', isNew: true, items: version.items });
      expect(navigate).toHaveBeenCalledWith(['/finance/budget'], { queryParams: { month: '2027-01' } });
    });
  });
});
