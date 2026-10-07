import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { TODAY } from '../../core/today';
import type { ChecklistItemDto, EnvelopeDto } from '../data/finance-api';
import { BatchRecordDialog } from '../records/batch-record-dialog';
import { RecordDialog } from '../records/record-dialog';
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
  let open: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    open = vi.fn(() => ({ closed: of(undefined) }));
    TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: TODAY, useValue: () => '2026-10-07' },
        { provide: Dialog, useValue: { open } },
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

  it('opens the record form pre-filled from a checklist item', async () => {
    const { el } = await render([], [checklistItem('salary', 'Salary')]);
    el.querySelector<HTMLButtonElement>('.checklist .item')?.click();
    expect(open).toHaveBeenCalledWith(
      RecordDialog,
      expect.objectContaining({ data: { type: 'income', budgetItemId: 'salary', amount: '1200.00' } }),
    );
  });

  it('records the selected items together', async () => {
    const items = [checklistItem('rent', 'Rent'), checklistItem('power', 'Electricity'), checklistItem('water', 'Water')];
    const { el, fixture } = await render([], items);
    const boxes = el.querySelectorAll<HTMLInputElement>('.checklist input[type=checkbox]');
    boxes[0].click();
    boxes[2].click();
    fixture.detectChanges();
    const button = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Record 2 selected'));
    button?.click();
    expect(open).toHaveBeenCalledWith(BatchRecordDialog, expect.objectContaining({ data: { items: [items[0], items[2]] } }));
  });

  it('opens an empty record form from the + button', async () => {
    const { el } = await render([], []);
    el.querySelector<HTMLButtonElement>('.new-entry')?.click();
    expect(open).toHaveBeenCalledWith(RecordDialog, expect.objectContaining({ data: {} }));
  });

  it('says when no plan covers this month', async () => {
    const { el } = await render(404, 404);
    expect(el.textContent).toContain('No budget plan covers this month yet.');
    expect(el.querySelector('.envelopes')).toBeNull();
  });
});
