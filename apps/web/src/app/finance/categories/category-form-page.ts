import { Component, computed, effect, inject, signal } from '@angular/core';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { applyFieldErrors, problemOf } from '../../core/problem';
import { FormNavigation } from '../../ui/form-navigation';
import { Toast } from '../../ui/toast';
import { CategoriesApi } from '../data/finance-api';
import { errorText } from '../records/form-errors';
import { categoryTree, categoryWithDescendants } from './category-tree';

/**
 * Creates, renames, moves or deletes a category (requirements §2).
 * Routes: `/finance/categories/new?parent=<id>` (parent optional) and
 * `/finance/categories/:id` (ADR 0022).
 */
@Component({
  selector: 'selah-category-form-page',
  host: { class: 'form-page' },
  imports: [ReactiveFormsModule],
  templateUrl: './category-form-page.html',
})
export class CategoryFormPage {
  private readonly categoriesApi = inject(CategoriesApi);
  private readonly nav = inject(FormNavigation);
  private readonly toast = inject(Toast);
  private readonly route = inject(ActivatedRoute).snapshot;
  /** The category being edited; undefined on `/finance/categories/new`. */
  private readonly editId = this.route.paramMap.get('id') ?? undefined;
  /** A new category's id is generated once, so a retry never duplicates it (ADR 0017). */
  private readonly id = this.editId ?? crypto.randomUUID();
  /** The list gives both the category and the parents to choose from. */
  protected readonly categories = this.categoriesApi.list();

  protected readonly editing = !!this.editId;
  /** Guarded: a resource's value() throws while it is in an error state. */
  private readonly list = computed(() => (this.categories.hasValue() ? this.categories.value() : []));
  protected readonly category = computed(() => this.list().find((c) => c.id === this.editId));
  protected readonly loading = computed(() => this.categories.isLoading());
  protected readonly notFound = computed(
    () => this.editing && (!!this.categories.error() || (this.categories.status() === 'resolved' && !this.category())),
  );
  /** Any category except this one and its subcategories, which would make a loop. */
  protected readonly parentOptions = computed(() => {
    const list = this.list();
    const excluded = this.editId ? categoryWithDescendants(list, this.editId) : new Set<string>();
    return categoryTree(list).filter((c) => !excluded.has(c.id));
  });

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(100), Validators.pattern(/\S/)]],
    /** '' is the top level. */
    parentId: this.route.queryParamMap.get('parent') ?? '',
  });
  protected readonly saving = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly errorText = errorText;

  constructor() {
    // Fill the form once the category arrives, unless the user already typed.
    effect(() => {
      const category = this.category();
      if (!category || this.form.dirty) return;
      this.form.setValue({ name: category.name, parentId: category.parentId ?? '' });
    });
  }

  protected cancel(): void {
    this.nav.leave('/settings');
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.loading() || this.notFound()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    try {
      await this.categoriesApi.upsert(this.id, {
        name: v.name.trim(),
        parentId: v.parentId || null,
        sortOrder: this.category()?.sortOrder ?? 0,
      });
      this.nav.leave('/settings', $localize`:@@category.saved:Category saved.`);
    } catch (error) {
      // A duplicate name at the same level is a 409 with no field; it goes to a toast.
      const unmatched = applyFieldErrors(problemOf(error), (field) => this.controlFor(field));
      if (unmatched.length) this.toast.show(unmatched.join(' '));
    } finally {
      this.saving.set(false);
    }
  }

  async remove(): Promise<void> {
    if (!this.editId) return;
    if (!this.confirmingDelete()) {
      this.confirmingDelete.set(true);
      return;
    }
    this.saving.set(true);
    try {
      await this.categoriesApi.remove(this.editId);
      this.nav.leave('/settings', $localize`:@@category.deleted:Category deleted.`);
    } catch (error) {
      // 409 while it still has subcategories.
      this.toast.show(problemOf(error).message);
      this.confirmingDelete.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  private controlFor(field: string): AbstractControl | undefined {
    return (this.form.controls as Record<string, AbstractControl>)[field];
  }
}
