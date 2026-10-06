import { Injectable } from '@nestjs/common';
import { ConflictError, NotFoundError, RuleViolationError } from '../../common/errors';
import type { CategoryDto, UpsertCategoryDto } from './categories.dto';
import { CategoriesRepository, type CategoryRow } from './categories.repository';

/** Deeper than any real category tree; stops a corrupted loop from spinning. */
const MAX_DEPTH = 100;

@Injectable()
export class CategoriesService {
  constructor(private readonly categories: CategoriesRepository) {}

  /** A flat list; the client builds the tree from `parentId`. */
  async list(): Promise<CategoryDto[]> {
    return (await this.categories.listLive()).map(toDto);
  }

  async get(id: string): Promise<CategoryDto> {
    const row = await this.categories.findById(id);
    if (!row || row.deletedAt) throw new NotFoundError(`Category ${id} not found.`);
    return toDto(row);
  }

  /** Creates or replaces a category (ADR 0017). */
  async upsert(id: string, input: UpsertCategoryDto): Promise<{ category: CategoryDto; created: boolean }> {
    const existing = await this.categories.findById(id);
    if (existing?.deletedAt) throw new ConflictError(`Category ${id} was deleted.`);

    const parentId = input.parentId ?? null;
    if (parentId) await this.assertValidParent(id, parentId);

    const values = { name: input.name.trim(), parentId, sortOrder: input.sortOrder ?? 0 };
    if (existing) await this.categories.update(id, values);
    else await this.categories.insert(id, values);
    return { category: await this.get(id), created: !existing };
  }

  /** Soft-deletes a category without live subcategories (ADR 0017). */
  async remove(id: string): Promise<void> {
    const existing = await this.categories.findById(id);
    if (!existing) throw new NotFoundError(`Category ${id} not found.`);
    if (existing.deletedAt) return;
    if (await this.categories.hasLiveChildren(id)) {
      throw new ConflictError('The category still has subcategories. Delete or move them first.');
    }
    await this.categories.softDelete(id);
  }

  /** The parent must be live, and must not be the category or one of its descendants. */
  private async assertValidParent(id: string, parentId: string): Promise<void> {
    const invalid = (message: string) => new RuleViolationError(message, { parentId: [message] });
    let ancestorId: string | null = parentId;
    for (let depth = 0; ancestorId && depth < MAX_DEPTH; depth++) {
      if (ancestorId === id) throw invalid("A category can't be moved under itself or one of its subcategories.");
      const ancestor = await this.categories.findById(ancestorId);
      if (!ancestor || ancestor.deletedAt) {
        throw invalid(depth === 0 ? 'The parent category does not exist.' : 'The category tree is broken.');
      }
      ancestorId = ancestor.parentId;
    }
  }
}

function toDto(row: CategoryRow): CategoryDto {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
