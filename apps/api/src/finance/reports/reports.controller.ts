import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblems } from '../../common/api-problems.decorator';
import {
  AsOfDateQuery,
  BudgetMovementDto,
  BudgetTransfersReportQuery,
  ChecklistItemDto,
  EnvelopeDto,
  MonthlyReviewDto,
  MonthQuery,
} from './reports.dto';
import { ReportsService } from './reports.service';

@ApiTags('finance: reports')
@Controller('finance/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('envelopes')
  @ApiOperation({
    operationId: 'getEnvelopes',
    summary: 'What is left in every rollover budget on a day, with its current period',
  })
  @ApiOkResponse({ type: EnvelopeDto, isArray: true })
  @ApiProblems(400, 404, 422)
  envelopes(@Query() query: AsOfDateQuery): Promise<EnvelopeDto[]> {
    return this.reports.envelopes(query.date);
  }

  @Get('checklist')
  @ApiOperation({
    operationId: 'getChecklist',
    summary: "The recurring checklist for the periods containing a day: what's recorded and what isn't yet",
  })
  @ApiOkResponse({ type: ChecklistItemDto, isArray: true })
  @ApiProblems(400, 404, 422)
  checklist(@Query() query: AsOfDateQuery): Promise<ChecklistItemDto[]> {
    return this.reports.checklist(query.date);
  }

  @Get('monthly')
  @ApiOperation({ operationId: 'getMonthlyReview', summary: 'Plan vs. actual per section and item for a month' })
  @ApiOkResponse({ type: MonthlyReviewDto })
  @ApiProblems(400, 404, 422)
  monthly(@Query() query: MonthQuery): Promise<MonthlyReviewDto> {
    return this.reports.monthly(query.month);
  }

  @Get('budget-transfers')
  @ApiOperation({
    operationId: 'getBudgetTransfersReport',
    summary: 'Manual budget transfers and computed resets in a date range, in date order',
  })
  @ApiOkResponse({ type: BudgetMovementDto, isArray: true })
  @ApiProblems(400, 422)
  budgetTransfers(@Query() query: BudgetTransfersReportQuery): Promise<BudgetMovementDto[]> {
    return this.reports.budgetTransfers(query);
  }
}
