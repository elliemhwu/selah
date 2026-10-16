import { Injectable } from '@nestjs/common';
import {
  assertDateRange,
  assertRealDate,
  budgetMovements,
  checklistReport,
  envelopesReport,
  monthlyReview,
  type ReportData,
} from '@selah/finance-core';
import type { LocalDate, YearMonth } from '@selah/shared-types';
import { addDays, endOfMonth } from '@selah/shared-utils';
import { BudgetTransfersRepository } from '../budget-transfers/budget-transfers.repository';
import { PlanRepository } from '../plan/plan.repository';
import type {
  BudgetMovementDto,
  BudgetTransfersReportQuery,
  ChecklistItemDto,
  EnvelopeDto,
  MonthlyReviewDto,
} from './reports.dto';
import { ReportsRepository } from './reports.repository';

/**
 * The reports of ADR 0019, calculated on read (ADR 0011). The calculation is
 * in finance-core, shared with the device (ADR 0025); this loads its data.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly reports: ReportsRepository,
    private readonly plan: PlanRepository,
    private readonly transfers: BudgetTransfersRepository,
  ) {}

  /** What is left in every rollover item of the active version (home screen). */
  async envelopes(date: LocalDate): Promise<EnvelopeDto[]> {
    assertRealDate(date);
    return envelopesReport(await this.dataUntil(date), date);
  }

  /** This period's recurring items that aren't envelopes: recorded or not yet (home screen). */
  async checklist(date: LocalDate): Promise<ChecklistItemDto[]> {
    assertRealDate(date);
    // A period can end after `date`: the month, or a week up to six days into the next month.
    return checklistReport(await this.dataUntil(addDays(endOfMonth(date), 6)), date);
  }

  /** Plan vs. actual for a month (monthly review). */
  async monthly(month: YearMonth): Promise<MonthlyReviewDto> {
    return monthlyReview(await this.dataUntil(endOfMonth(`${month}-01`)), month);
  }

  /** Manual transfers and computed resets together, in date order (requirements §3.1). */
  async budgetTransfers(query: BudgetTransfersReportQuery): Promise<BudgetMovementDto[]> {
    assertDateRange(query.from, query.to);
    return budgetMovements(await this.dataUntil(query.to), query);
  }

  /** Every live plan version, and the lines and manual transfers up to `until`. */
  private async dataUntil(until: LocalDate): Promise<ReportData> {
    const [documents, weekStartDay, lines, transfers] = await Promise.all([
      this.plan.loadAllDocuments(),
      this.reports.weekStartDay(),
      this.reports.lines(undefined, until),
      this.transfers.list({ to: until, kind: 'manual' }),
    ]);
    return {
      versions: documents.map(({ version, items }) => ({
        id: version.id,
        effectiveFromMonth: version.effectiveFromMonth.slice(0, 7),
        items: items.map((item) => ({
          ...item,
          overrides: item.overrides.map((o) => ({ month: o.month.slice(0, 7), amount: o.amount })),
        })),
      })),
      lines,
      transfers: transfers.map((t) => ({
        id: t.id,
        occurredOn: t.occurredOn,
        occurredAt: t.occurredAt ? t.occurredAt.slice(0, 5) : null,
        fromItemId: t.fromItemId,
        toItemId: t.toItemId,
        amount: t.amount,
        note: t.note,
        createdAt: t.createdAt.toISOString(),
      })),
      weekStartDay,
    };
  }
}
