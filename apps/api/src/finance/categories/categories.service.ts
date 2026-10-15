import { Injectable } from '@nestjs/common';
import { assertCategoryDeletable, prepareCategory } from '@selah/finance-core';
import { NotFoundError } from '../../common/errors';
import type { CategoryDto, UpsertCategoryDto } from './categories.dto';
import { CategoriesRepository, type CategoryRow } from './categories.repository';

/** The category tree; the rules are in finance-core (ADR 0025). */
@Injectable()
export class CategoriesService {
  constructor(private readonly categories: CategoriesRepository) {}

  /** A flat list; the client builds the tree from `parentId`. */
  async list(): Promise<CategoryDto[]> {
    return (await this.categories.listLive()).map(toCategoryDto);
  }

  async get(id: string): Promise<CategoryDto> {
    const row = await this.categories.findById(id);
    if (!row || row.deletedAt) throw new NotFoundError(`Category ${id} not found.`);
    return toCategoryDto(row);
  }

  /** Creates or replaces a category (ADR 0017). */
  async upsert(id: string, input: UpsertCategoryDto): Promise<{ category: CategoryDto; created: boolean }> {
    const all = new Map((await this.categories.listAll()).map((c) => [c.id, c]));
    const existing = all.get(id);
    const values = prepareCategory(id, input, (categoryId) => all.get(categoryId));
    if (existing) await this.categories.update(id, values);
    else await this.categories.insert(id, values);
    return { category: await this.get(id), created: !existing };
  }

  /** Soft-deletes a category without live subcategories (ADR 0017). */
  async remove(id: string): Promise<void> {
    const existing = await this.categories.findById(id);
    if (!existing) throw new NotFoundError(`Category ${id} not found.`);
    if (existing.deletedAt) return;
    assertCategoryDeletable(await this.categories.hasLiveChildren(id));
    await this.categories.softDelete(id);
  }
}

export function toCategoryDto(row: CategoryRow): CategoryDto {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
