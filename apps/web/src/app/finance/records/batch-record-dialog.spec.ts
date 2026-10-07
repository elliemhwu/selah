import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TODAY } from '../../core/today';
import type { ChecklistItemDto } from '../data/finance-api';
import { BatchRecordDialog } from './batch-record-dialog';

const item = (budgetItemId: string, section: ChecklistItemDto['section'], planned: string) =>
  ({ budgetItemId, name: budgetItemId, section, planned }) as ChecklistItemDto;

describe('BatchRecordDialog', () => {
  let http: HttpTestingController;
  let close: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    close = vi.fn();
    TestBed.configureTestingModule({
      imports: [BatchRecordDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TODAY, useValue: () => '2026-10-07' },
        { provide: DIALOG_DATA, useValue: { items: [item('salary', 'income', '60000.00'), item('rent', 'expense', '15000.00'), item('power', 'expense', '1200.00')] } },
        { provide: DialogRef, useValue: { close } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(BatchRecordDialog);
    fixture.detectChanges();
    http.expectOne('/api/v1/finance/accounts').flush([
      { id: 'usd', name: 'USD', currency: 'USD' },
      { id: 'bank', name: 'Bank', currency: 'TWD' },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as { form: BatchRecordDialog['form'] };
    const submit = async () => {
      (fixture.nativeElement as HTMLElement).querySelector('form')?.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
    };
    return { fixture, component, submit };
  }

  it('pre-fills planned amounts and saves the included rows in one batch', async () => {
    const { component, submit } = await render();
    expect(component.form.controls.accountId.value).toBe('bank'); // TWD accounts only
    const rows = component.form.controls.rows.controls;
    expect(rows.map((r) => r.controls.amount.value)).toEqual(['60000', '15000', '1200']);

    rows[1].controls.include.setValue(false);
    rows[2].controls.amount.setValue('1342');
    await submit();

    const req = http.expectOne((r) => r.method === 'PUT' && r.url === '/api/v1/finance/records');
    const records = req.request.body.records;
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      type: 'income',
      occurredOn: '2026-10-07',
      accountId: 'bank',
      currency: 'TWD',
      note: null,
      lines: [{ amount: '60000', budgetItemId: 'salary' }],
    });
    expect(records[1]).toMatchObject({ type: 'expense', lines: [{ amount: '1342', budgetItemId: 'power' }] });
    req.flush([{ id: '1' }, { id: '2' }]);
    await Promise.resolve();
    expect(close).toHaveBeenCalledWith([{ id: '1' }, { id: '2' }]);
  });

  it('puts errors on the row that was sent', async () => {
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
});
