import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TODAY } from '../../core/today';
import type { ChecklistItemDto, EnvelopeDto } from '../data/finance-api';
import { HomePage } from './home-page';

const envelope: EnvelopeDto = {
  budgetItemId: 'daily',
  name: 'Daily Food',
  section: 'expense',
  parentItemId: null,
  cadence: 'daily',
  resetCycle: 'week',
  onReset: 'carry',
  carryToItemId: 'allowance',
  envelopeStart: '2026-10-01',
  resetsOn: '2026-10-11',
  period: { start: '2026-10-07', end: '2026-10-07' },
  allotment: '185.00',
  carryIn: '35.00',
  transfers: '0.00',
  spent: '0.00',
  available: '220.00',
};

const checklistItem = (budgetItemId: string, name: string, done = false): ChecklistItemDto => ({
  budgetItemId,
  name,
  section: budgetItemId === 'salary' ? 'income' : 'expense',
  parentItemId: null,
  cadence: 'monthly',
  period: { start: '2026-10-01', end: '2026-10-31' },
  planned: '1200.00',
  recorded: done ? '1200.00' : '0.00',
  lineCount: done ? 1 : 0,
  done,
});

describe('HomePage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: TODAY, useValue: () => '2026-10-07' },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(envelopes: EnvelopeDto[] | 404, checklist: ChecklistItemDto[] | 404) {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    const respond = (url: string, body: object | 404) => {
      const req = http.expectOne((r) => r.url === url && r.params.get('date') === '2026-10-07');
      if (body === 404) req.flush({ status: 404 }, { status: 404, statusText: 'Not Found' });
      else req.flush(body);
    };
    respond('/api/v1/finance/reports/envelopes', envelopes);
    respond('/api/v1/finance/reports/checklist', checklist);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it("shows what's left and the checklist", async () => {
    const { el } = await render([envelope], [checklistItem('rent', 'Rent'), checklistItem('salary', 'Salary', true)]);
    expect(el.querySelector('.envelope-name')?.textContent).toContain('Daily Food');
    expect(el.querySelector('.envelope-available')?.textContent).toContain('220');
    expect(el.querySelector('.envelope')?.textContent).toContain('resets Sun');
    const rows = [...el.querySelectorAll('.checklist li')];
    expect(rows.map((r) => r.querySelector('.item-name')?.textContent)).toEqual(['Rent', 'Salary']);
    expect(rows[0].querySelector('.item-amount')?.textContent).toContain('1,200');
    expect(rows[0].querySelector('input.check')).not.toBeNull();
    expect(rows[1].classList).toContain('done');
    expect(rows[1].querySelector('.done-mark')).not.toBeNull();
    expect(rows[1].querySelector('input.check')).toBeNull();
  });

  it('links a checklist item to the entry form, pre-filled', async () => {
    const { el } = await render([], [checklistItem('salary', 'Salary')]);
    const href = el.querySelector<HTMLAnchorElement>('.checklist .item')?.getAttribute('href');
    expect(href).toBe('/records/new?type=income&item=salary&amount=1200.00');
  });

  it('links the selected items to batch entry', async () => {
    const items = [checklistItem('rent', 'Rent'), checklistItem('power', 'Electricity'), checklistItem('water', 'Water')];
    const { el, fixture } = await render([], items);
    const boxes = el.querySelectorAll<HTMLInputElement>('.checklist input[type=checkbox]');
    boxes[2].click();
    boxes[0].click();
    fixture.detectChanges();
    const link = [...el.querySelectorAll('a')].find((a) => a.textContent?.includes('Record 2 selected'));
    expect(link?.getAttribute('href')).toBe('/records/batch?items=rent,water&date=2026-10-07');
  });

  it('links New entry to an empty form', async () => {
    const { el } = await render([], []);
    expect(el.querySelector('.new-entry')?.getAttribute('href')).toBe('/records/new');
  });

  it('says when no plan covers this month', async () => {
    const { el } = await render(404, 404);
    expect(el.textContent).toContain('No budget plan covers this month yet.');
    expect(el.querySelector('.envelopes')).toBeNull();
  });
});
