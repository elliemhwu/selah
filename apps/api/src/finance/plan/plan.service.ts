import { Injectable } from '@nestjs/common';
import { assertPlanVersionDeletable, preparePlanVersion } from '@selah/finance-core';
import { NotFoundError } from '../../common/errors';
import type {
  PlanItemDto,
  PlanVersionDto,
  PlanVersionSummaryDto,
  UpsertPlanVersionDto,
} from './plan.dto';
import { type ItemData, PlanRepository, type VersionDocument } from './plan.repository';

/** Versioned plans saved whole (ADR 0018); the rules are in finance-core (ADR 0025). */
@Injectable()
export class PlanService {
  constructor(private readonly plan: PlanRepository) {}

  async listVersions(): Promise<PlanVersionSummaryDto[]> {
    const rows = await this.plan.listVersions();
    const newestId = rows.at(-1)?.id;
    return rows.map((v) => ({
      id: v.id,
      effectiveFromMonth: toYearMonth(v.effectiveFromMonth),
      note: v.note,
      editable: v.id === newestId,
      itemCount: v.itemCount,
    }));
  }

  async getVersion(id: string): Promise<PlanVersionDto> {
    const version = await this.plan.findVersion(id);
    if (!version || version.deletedAt) throw new NotFoundError(`Plan version ${id} not found.`);
    return this.toDto(await this.plan.loadDocument(version));
  }

  /** The version in effect for a month (YYYY-MM). */
  async activeFor(month: string): Promise<PlanVersionDto> {
    const version = await this.plan.activeVersion(`${month}-01`);
    if (!version) throw new NotFoundError(`No plan version covers ${month}.`);
    return this.toDto(await this.plan.loadDocument(version));
  }

  /** Creates or replaces a whole version (ADR 0018). */
  async upsert(id: string, input: UpsertPlanVersionDto): Promise<{ version: PlanVersionDto; created: boolean }> {
    const [existing, newest, previous, knownSections] = await Promise.all([
      this.plan.findVersion(id),
      this.plan.newestVersion(),
      this.plan.newestVersion(id),
      this.plan.itemSections(input.items.map((i) => i.budgetItemId)),
    ]);
    const values = preparePlanVersion(id, input, {
      existing,
      newest,
      previous: previous && { effectiveFromMonth: toYearMonth(previous.effectiveFromMonth) },
      knownSections,
    });

    const created = await this.plan.save({
      id,
      effectiveFromMonth: `${values.effectiveFromMonth}-01`,
      note: values.note,
      items: values.items.map((item) => ({
        ...item,
        overrides: item.overrides.map((o) => ({ month: `${o.month}-01`, amount: o.amount })),
      })),
    });
    return { version: await this.getVersion(id), created };
  }

  /** Deletes the newest version; older ones stay as the log (ADR 0018). */
  async remove(id: string): Promise<void> {
    const version = await this.plan.findVersion(id);
    if (!version) throw new NotFoundError(`Plan version ${id} not found.`);
    if (version.deletedAt) return;
    assertPlanVersionDeletable(id, await this.plan.newestVersion());
    await this.plan.softDeleteVersion(id);
  }

  private async toDto({ version, items }: VersionDocument): Promise<PlanVersionDto> {
    const newest = await this.plan.newestVersion();
    return { ...toVersionFields({ version, items }), editable: newest?.id === version.id };
  }
}

/** A version as stored, without `editable`, which depends on the other versions. */
export function toVersionFields({ version, items }: VersionDocument): Omit<PlanVersionDto, 'editable'> {
  return {
    id: version.id,
    effectiveFromMonth: toYearMonth(version.effectiveFromMonth),
    note: version.note,
    items: items.map(toItemDto),
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt.toISOString(),
  };
}

function toYearMonth(firstOfMonth: string): string {
  return firstOfMonth.slice(0, 7);
}

function toItemDto(item: ItemData): PlanItemDto {
  return { ...item, overrides: item.overrides.map((o) => ({ month: toYearMonth(o.month), amount: o.amount })) };
}
