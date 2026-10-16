import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import type { StoredCategory } from '../../data/device-storage';
import { deviceData, flushSaves, settle, storedCategory } from '../../data/testing';
import { FormNavigation } from '../../ui/form-navigation';
import { Toast } from '../../ui/toast';
import { CategoryFormPage } from './category-form-page';

const categories = [
  storedCategory('Food', null, { sortOrder: 2 }),
  storedCategory('Lunch', 'Food'),
  storedCategory('Bento', 'Lunch'),
  storedCategory('Travel'),
];

describe('CategoryFormPage', () => {
  let leave: ReturnType<typeof vi.fn>;
  let toast: { show: ReturnType<typeof vi.fn> };

  async function render(route: { params?: Record<string, string>; query?: Record<string, string> } = {}, seed: StoredCategory[] = categories) {
    leave = vi.fn();
    toast = { show: vi.fn() };
    const device = deviceData({ categories: seed });
    TestBed.configureTestingModule({
      imports: [CategoryFormPage],
      providers: [
        ...device.providers,
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(route.params ?? {}), queryParamMap: convertToParamMap(route.query ?? {}) } },
        },
        { provide: FormNavigation, useValue: { leave } },
        { provide: Toast, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(CategoryFormPage);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const form = (fixture.componentInstance as unknown as { form: CategoryFormPage['form'] }).form;
    const submit = async () => {
      el.querySelector('form')?.dispatchEvent(new Event('submit'));
      await flushSaves();
    };
    const parentChoices = () => [...el.querySelectorAll('#cat-parent option')].map((o) => o.textContent?.trim());
    const saved = (id: string) => device.storage.snapshot().categories.find((c) => c.id === id);
    return { fixture, el, form, submit, parentChoices, saved, storage: device.storage };
  }

  it('creates a subcategory under the parent from the link', async () => {
    const { form, submit, storage } = await render({ query: { parent: 'Food' } });
    form.controls.name.setValue(' Snacks ');
    await submit();
    expect(storage.snapshot().categories.find((c) => c.name === 'Snacks')).toMatchObject({ parentId: 'Food', sortOrder: 0, deletedAt: null });
    expect(leave).toHaveBeenCalledWith('/settings', 'Category saved.');
  });

  it('moves a category to the top level, keeping its sort order', async () => {
    const { form, submit, saved } = await render({ params: { id: 'Lunch' } });
    expect(form.getRawValue()).toEqual({ name: 'Lunch', parentId: 'Food' });
    form.patchValue({ name: 'Lunches', parentId: '' });
    await submit();
    expect(saved('Lunch')).toMatchObject({ name: 'Lunches', parentId: null, sortOrder: 0 });
  });

  it("doesn't offer the category itself or its subcategories as a parent", async () => {
    const { parentChoices } = await render({ params: { id: 'Lunch' } });
    expect(parentChoices()).toEqual(['Nothing (top level)', 'Travel', 'Food']);
  });

  it('refuses a duplicate name at the same level', async () => {
    const { form, submit, storage } = await render();
    form.controls.name.setValue('Food');
    await submit();
    expect(toast.show).toHaveBeenCalledWith('A category named "Food" already exists at this level.');
    expect(storage.snapshot().categories).toHaveLength(4);
    expect(leave).not.toHaveBeenCalled();
  });

  it('asks twice before deleting, and explains a refusal', async () => {
    const { fixture, el, saved } = await render({ params: { id: 'Food' } });
    const button = () => el.querySelector('.danger button') as HTMLButtonElement;
    button().click();
    fixture.detectChanges();
    expect(button().textContent).toContain('Tap again to delete Food');
    button().click();
    await flushSaves();
    expect(toast.show).toHaveBeenCalledWith('The category still has subcategories. Delete or move them first.');
    expect(saved('Food')?.deletedAt).toBeNull();
    expect(leave).not.toHaveBeenCalled();
  });

  it('deletes a category without subcategories', async () => {
    const { fixture, el, saved } = await render({ params: { id: 'Travel' } });
    const button = () => el.querySelector('.danger button') as HTMLButtonElement;
    button().click();
    fixture.detectChanges();
    button().click();
    await flushSaves();
    expect(saved('Travel')?.deletedAt).not.toBeNull();
    expect(leave).toHaveBeenCalledWith('/settings', 'Category deleted.');
  });

  it('says when the category does not exist', async () => {
    const { el } = await render({ params: { id: 'gone' } });
    expect(el.textContent).toContain("This category isn't in the ledger.");
  });
});
