import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TODAY } from '../../core/today';
import { FormNavigation } from '../../ui/form-navigation';
import type { ChecklistItemDto } from '../data/finance-api';
import { BatchRecordPage } from './batch-record-page';

const API = '/api/v1/finance';
const item = (budgetItemId: string, section: ChecklistItemDto['section'], planned: string) =>
  ({ budgetItemId, name: budgetItemId, section, planned }) as ChecklistItemDto;
const checklist = [item('salary', 'income', '60000.00'), item('rent', 'expense', '15000.00'), item('power', 'expense', '1200.00'), item('tax', 'government', '3000.00')];

describe('BatchRecordPage', () => {
  let http: HttpTestingController;
  let leave: ReturnType<typeof vi.fn>;

  function setup(items = 'salary,rent,power') {
    leave = vi.fn();
    TestBed.configureTestingModule({
      imports: [BatchRecordPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TODAY, useValue: () => '2026-10-07' },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ items, date: '2026-10-05' }) } } },
        { provide: FormNavigation, useValue: { leave } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  }

  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(BatchRecordPage);
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${API}/reports/checklist` && r.params.get('date') === '2026-10-05').flush(checklist);
    http.expectOne(`${API}/accounts`).flush([
      { id: 'usd', name: 'USD', currency: 'USD' },
      { id: 'bank', name: 'Bank', currency: 'TWD' },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as { form: BatchRecordPage['form'] };
    const submit = async () => {
      (fixture.nativeElement as HTMLElement).querySelector('form')?.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
    };
    return { fixture, component, submit };
  }

  it("builds rows from the day's checklist and saves the included ones in one batch", async () => {
    setup();
    const { component, submit } = await render();
    expect(component.form.controls.accountId.value).toBe('bank'); // TWD accounts only
    expect(component.form.controls.occurredOn.value).toBe('2026-10-05');
    const rows = component.form.controls.rows.controls;
    expect(rows.map((r) => r.controls.amount.value)).toEqual(['60000', '15000', '1200']);

    rows[1].controls.include.setValue(false);
    rows[2].controls.amount.setValue('1342');
    await submit();

    const req = http.expectOne((r) => r.method === 'PUT' && r.url === `${API}/records`);
    const records = req.request.body.records;
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      type: 'income',
      occurredOn: '2026-10-05',
      accountId: 'bank',
      currency: 'TWD',
      note: null,
      lines: [{ amount: '60000', budgetItemId: 'salary' }],
    });
    expect(records[1]).toMatchObject({ type: 'expense', lines: [{ amount: '1342', budgetItemId: 'power' }] });
    req.flush([{ id: '1' }, { id: '2' }]);
    await Promise.resolve();
    expect(leave).toHaveBeenCalledWith('/', 'Saved 2 entries.');
  });

  it('puts errors on the row that was sent', async () => {
    setup();
    const { component, submit, fixture } = await render();
    const rows = component.form.controls.rows.controls;
    rows[0].controls.include.setValue(false);
    await submit();
    http.expectOne((r) => r.method === 'PUT').flush(
      { status: 422, title: 'Unprocessable Entity', errors: { 'records.1.lines.0.amount': ['Too much.'] } },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await fixture.whenStable();
    expect(rows[2].controls.amount.errors).toEqual({ server: 'Too much.' });
    expect(rows[1].controls.amount.errors).toBeNull();
  });

  it('says when the items are no longer on the checklist', async () => {
    setup('gone');
    const { fixture } = await render();
    expect(fixture.nativeElement.textContent).toContain("These items aren't on this period's checklist any more.");
  });
});
