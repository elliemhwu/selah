import { Body, Controller, Delete, Get, HttpCode, Param, Put, Query, Res } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiProblems } from '../../common/api-problems.decorator';
import { UUID_PARAM } from '../../common/uuid-param';
import { BudgetTransferDto, ListBudgetTransfersQuery, UpsertBudgetTransferDto } from './budget-transfers.dto';
import { BudgetTransfersService } from './budget-transfers.service';

@ApiTags('finance: budget transfers')
@Controller('finance/budget-transfers')
export class BudgetTransfersController {
  constructor(private readonly transfers: BudgetTransfersService) {}

  @Get()
  @ApiOperation({
    operationId: 'listBudgetTransfers',
    summary: 'Stored budget transfers in a date range, oldest first (computed resets are in the reports)',
  })
  @ApiOkResponse({ type: BudgetTransferDto, isArray: true })
  @ApiProblems(400, 422)
  list(@Query() query: ListBudgetTransfersQuery): Promise<BudgetTransferDto[]> {
    return this.transfers.list(query);
  }

  @Get(':id')
  @ApiOperation({ operationId: 'getBudgetTransfer', summary: 'One budget transfer' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: BudgetTransferDto })
  @ApiProblems(400, 404)
  get(@Param('id', UUID_PARAM) id: string): Promise<BudgetTransferDto> {
    return this.transfers.get(id);
  }

  @Put(':id')
  @ApiOperation({
    operationId: 'upsertBudgetTransfer',
    summary: 'Create or replace a manual budget transfer (the client generates the id)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: BudgetTransferDto, description: 'Replaced.' })
  @ApiCreatedResponse({ type: BudgetTransferDto, description: 'Created.' })
  @ApiProblems(400, 409, 422)
  async upsert(
    @Param('id', UUID_PARAM) id: string,
    @Body() body: UpsertBudgetTransferDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BudgetTransferDto> {
    const { transfer, created } = await this.transfers.upsert(id, body);
    response.status(created ? 201 : 200);
    return transfer;
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteBudgetTransfer', summary: 'Soft-delete a manual budget transfer' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Deleted (or already deleted).' })
  @ApiProblems(400, 404, 409)
  remove(@Param('id', UUID_PARAM) id: string): Promise<void> {
    return this.transfers.remove(id);
  }
}
