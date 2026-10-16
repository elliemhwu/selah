import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { PlanItemDto } from '../data/finance-api';
import { TODAY } from '../../core/today';
import type { DeviceSnapshot } from '../../data/device-storage';
import { deviceData, planItem, settle, storedLine, storedRecord, storedVersion } from '../../data/testing';
import { HomePage } from './home-page';

// Today is Wednesday 2026-10-07; weeks start on Monday.
const daily = planItem('daily', {
  name: 'Daily Food',
  cadence: 'daily',
  amount: '185.00',
  rollover: true,
  resetCycle: 'week',
  onReset: 'carry',
  carryToItemId: 'allowance',
});
const allowance = planItem('allowance', { name: 'Allowance', cadence: 'weekly', amount: '500.00', rollover: true, resetCycle: 'never' });
const monthly = (budgetItemId: string, name: string, section: PlanItemDto['section'] = 'expense') =>
  planItem(budgetItemId, { name, section, amount: '1200.00' });
const spent = (id: string, occurredOn: string, amount: string, budgetItemId: string, type: 'income' | 'expense' = 'expense') =>
  storedRecord(id, { type, occurredOn, lines: [storedLine(`${id}-l`, amount, { budgetItemId })] });

describe('HomePage', () => {
  async function render(items: PlanItemDto[] | null, seed: Partial<DeviceSnapshot> = {}) {
    TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideRouter([]),
        { provide: TODAY, useValue: () => '2026-10-07' },
        ...deviceData({ planVersions: items ? [storedVersion('v1', '2026-10', items)] : [], ...seed }).providers,
      ],
    });
    const fixture = TestBed.createComponent(HomePage);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it("shows what's left and the checklist", async () => {
    const { el } = await render([daily, allowance, monthly('rent', 'Rent'), monthly('salary', 'Salary', 'income')], {
      records: [
        spent('mon', '2026-10-05', '185.00', 'daily'),
        spent('tue', '2026-10-06', '150.00', 'daily'),
        spent('pay', '2026-10-05', '1200.00', 'salary', 'income'),
      ],
    });
    const envelopes = [...el.querySelectorAll('.envelope')];
    const food = envelopes.find((e) => e.querySelector('.envelope-name')?.textContent?.includes('Daily Food'));
    // 185 for today plus the 35 left from Tuesday.
    expect(food?.querySelector('.envelope-available')?.textContent).toContain('220');
    expect(food?.textContent).toContain('resets Sun');
    const rows = [...el.querySelectorAll('.checklist li')];
    expect(rows.map((r) => r.querySelector('.item-name')?.textContent)).toEqual(['Rent', 'Salary']);
    expect(rows[0].querySelector('.item-amount')?.textContent).toContain('1,200');
    expect(rows[0].querySelector('input.check')).not.toBeNull();
    expect(rows[1].classList).toContain('done');
    expect(rows[1].querySelector('.done-mark')).not.toBeNull();
    expect(rows[1].querySelector('input.check')).toBeNull();
  });

  it('links a checklist item to the entry form, pre-filled', async () => {
    const { el } = await render([monthly('salary', 'Salary', 'income')]);
    const href = el.querySelector<HTMLAnchorElement>('.checklist .item')?.getAttribute('href');
    expect(href).toBe('/records/new?type=income&item=salary&amount=1200.00');
  });

  it('links the selected items to batch entry', async () => {
    const { el, fixture } = await render([monthly('rent', 'Rent'), monthly('power', 'Electricity'), monthly('water', 'Water')]);
    const boxes = el.querySelectorAll<HTMLInputElement>('.checklist input[type=checkbox]');
    boxes[2].click();
    boxes[0].click();
    fixture.detectChanges();
    const link = [...el.querySelectorAll('a')].find((a) => a.textContent?.includes('Record 2 selected'));
    expect(link?.getAttribute('href')).toBe('/records/batch?items=rent,water&date=2026-10-07');
  });

  it('links New entry to an empty form', async () => {
    const { el } = await render([]);
    expect(el.querySelector('.new-entry')?.getAttribute('href')).toBe('/records/new');
  });

  it('says when no plan covers this month', async () => {
    const { el } = await render(null);
    expect(el.textContent).toContain('No budget plan covers this month yet.');
    expect(el.querySelector('.envelopes')).toBeNull();
  });
});
