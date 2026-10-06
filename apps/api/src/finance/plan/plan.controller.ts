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
import { ActivePlanQuery, PlanVersionDto, PlanVersionSummaryDto, UpsertPlanVersionDto } from './plan.dto';
import { PlanService } from './plan.service';

@ApiTags('finance: plan')
@Controller('finance/plan-versions')
export class PlanVersionsController {
  constructor(private readonly plan: PlanService) {}

  @Get()
  @ApiOperation({ operationId: 'listPlanVersions', summary: 'Plan versions, oldest first' })
  @ApiOkResponse({ type: PlanVersionSummaryDto, isArray: true })
  list(): Promise<PlanVersionSummaryDto[]> {
    return this.plan.listVersions();
  }

  @Get(':id')
  @ApiOperation({ operationId: 'getPlanVersion', summary: 'A plan version with all its items' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: PlanVersionDto })
  @ApiProblems(400, 404)
  get(@Param('id', UUID_PARAM) id: string): Promise<PlanVersionDto> {
    return this.plan.getVersion(id);
  }

  @Put(':id')
  @ApiOperation({
    operationId: 'upsertPlanVersion',
    summary: 'Create or replace a whole plan version (only the newest can change)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: PlanVersionDto, description: 'Replaced.' })
  @ApiCreatedResponse({ type: PlanVersionDto, description: 'Created.' })
  @ApiProblems(400, 409, 422)
  async upsert(
    @Param('id', UUID_PARAM) id: string,
    @Body() body: UpsertPlanVersionDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PlanVersionDto> {
    const { version, created } = await this.plan.upsert(id, body);
    response.status(created ? 201 : 200);
    return version;
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deletePlanVersion', summary: 'Delete the newest plan version' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Deleted (or already deleted).' })
  @ApiProblems(400, 404, 409)
  remove(@Param('id', UUID_PARAM) id: string): Promise<void> {
    return this.plan.remove(id);
  }
}

@ApiTags('finance: plan')
@Controller('finance/plan')
export class ActivePlanController {
  constructor(private readonly plan: PlanService) {}

  @Get()
  @ApiOperation({ operationId: 'getActivePlan', summary: 'The plan version in effect for a month' })
  @ApiOkResponse({ type: PlanVersionDto })
  @ApiProblems(400, 404)
  get(@Query() query: ActivePlanQuery): Promise<PlanVersionDto> {
    return this.plan.activeFor(query.month);
  }
}
