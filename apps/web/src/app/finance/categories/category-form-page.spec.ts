import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { FormNavigation } from '../../ui/form-navigation';
import { Toast } from '../../ui/toast';
import type { CategoryDto } from '../data/finance-api';
import { CategoryFormPage } from './category-form-page';

const API = '/api/v1/finance/categories';
const category = (id: string, parentId: string | null = null, sortOrder = 0) => ({ id, name: id, parentId, sortOrder }) as CategoryDto;
const categories = [category('Food', null, 2), category('Lunch', 'Food'), category('Bento', 'Lunch'), category('Travel')];

describe('CategoryFormPage', () => {
  let http: HttpTestingController;
  let leave: ReturnType<typeof vi.fn>;
  let toast: { show: ReturnType<typeof vi.fn> };

  async function render(route: { params?: Record<string, string>; query?: Record<string, string> } = {}, list = categories) {
    leave = vi.fn();
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      imports: [CategoryFormPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(route.params ?? {}), queryParamMap: convertToParamMap(route.query ?? {}) } },
        },
        { provide: FormNavigation, useValue: { leave } },
        { provide: Toast, useValue: toast },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CategoryFormPage);
    fixture.detectChanges();
    http.expectOne(API).flush(list);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const form = (fixture.componentInstance as unknown as { form: CategoryFormPage['form'] }).form;
    const submit = async () => {
      el.querySelector('form')?.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
    };
    const parentChoices = () => [...el.querySelectorAll('#cat-parent option')].map((o) => o.textContent?.trim());
    return { fixture, el, form, submit, parentChoices };
  }
  afterEach(() => http.verify());

  it('creates a subcategory under the parent from the link', async () => {
    const { form, submit } = await render({ query: { parent: 'Food' } });
    form.controls.name.setValue(' Snacks ');
    await submit();
    const req = http.expectOne((r) => r.method === 'PUT' && r.url.startsWith(`${API}/`));
    expect(req.request.body).toEqual({ name: 'Snacks', parentId: 'Food', sortOrder: 0 });
    req.flush({});
    await Promise.resolve();
    expect(leave).toHaveBeenCalledWith('/settings', 'Category saved.');
  });

  it('moves a category to the top level, keeping its sort order', async () => {
    const { form, submit } = await render({ params: { id: 'Food' } });
    expect(form.getRawValue()).toEqual({ name: 'Food', parentId: '' });
    form.controls.name.setValue('Groceries');
    await submit();
    const req = http.expectOne({ method: 'PUT', url: `${API}/Food` });
    expect(req.request.body).toEqual({ name: 'Groceries', parentId: null, sortOrder: 2 });
    req.flush({});
  });

  it("doesn't offer the category itself or its subcategories as a parent", async () => {
    const { parentChoices } = await render({ params: { id: 'Lunch' } });
    expect(parentChoices()).toEqual(['Nothing (top level)', 'Food', 'Travel']);
  });

  it('shows a duplicate name refusal', async () => {
    const { form, submit } = await render();
    form.controls.name.setValue('Food');
    await submit();
    http
      .expectOne((r) => r.method === 'PUT')
      .flush({ status: 409, detail: 'A category named "Food" already exists at this level.' }, { status: 409, statusText: 'Conflict' });
    await Promise.resolve();
    expect(toast.show).toHaveBeenCalledWith('A category named "Food" already exists at this level.');
    expect(leave).not.toHaveBeenCalled();
  });

  it('asks twice before deleting, and explains a refusal', async () => {
    const { fixture, el } = await render({ params: { id: 'Food' } });
    const button = () => el.querySelector('.danger button') as HTMLButtonElement;
    button().click();
    fixture.detectChanges();
    expect(button().textContent).toContain('Tap again to delete Food');
    http.expectNone({ method: 'DELETE' });
    button().click();
    http
      .expectOne({ method: 'DELETE', url: `${API}/Food` })
      .flush({ status: 409, detail: 'The category still has subcategories. Delete or move them first.' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    expect(toast.show).toHaveBeenCalledWith('The category still has subcategories. Delete or move them first.');
    expect(leave).not.toHaveBeenCalled();
  });

  it('says when the category does not exist', async () => {
    const { el } = await render({ params: { id: 'gone' } });
    expect(el.textContent).toContain("This category isn't in the ledger.");
  });
});
