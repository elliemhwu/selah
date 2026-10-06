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
import {
  LastUsedRateDto,
  ListRecordsQuery,
  RecordDto,
  UpsertRecordBatchDto,
  UpsertRecordDto,
} from './records.dto';
import { RecordsService } from './records.service';

@ApiTags('finance: records')
@Controller('finance/records')
export class RecordsController {
  constructor(private readonly records: RecordsService) {}

  @Get()
  @ApiOperation({ operationId: 'listRecords', summary: 'Records in a date range, newest first, with their lines' })
  @ApiOkResponse({ type: RecordDto, isArray: true })
  @ApiProblems(400, 422)
  list(@Query() query: ListRecordsQuery): Promise<RecordDto[]> {
    return this.records.list(query);
  }

  @Put()
  @ApiOperation({
    operationId: 'upsertRecordBatch',
    summary: 'Create or replace several records at once, all or nothing (batch entry)',
  })
  @ApiOkResponse({ type: RecordDto, isArray: true })
  @ApiProblems(400, 409, 422)
  upsertBatch(@Body() body: UpsertRecordBatchDto): Promise<RecordDto[]> {
    return this.records.upsertBatch(body);
  }

  @Get(':id')
  @ApiOperation({ operationId: 'getRecord', summary: 'One record with its lines' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: RecordDto })
  @ApiProblems(400, 404)
  get(@Param('id', UUID_PARAM) id: string): Promise<RecordDto> {
    return this.records.get(id);
  }

  @Put(':id')
  @ApiOperation({
    operationId: 'upsertRecord',
    summary: 'Create or replace a record and its lines (the client generates the id)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: RecordDto, description: 'Replaced.' })
  @ApiCreatedResponse({ type: RecordDto, description: 'Created.' })
  @ApiProblems(400, 409, 422)
  async upsert(
    @Param('id', UUID_PARAM) id: string,
    @Body() body: UpsertRecordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RecordDto> {
    const { record, created } = await this.records.upsert(id, body);
    response.status(created ? 201 : 200);
    return record;
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteRecord', summary: 'Soft-delete a record and its lines' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Deleted (or already deleted).' })
  @ApiProblems(400, 404)
  remove(@Param('id', UUID_PARAM) id: string): Promise<void> {
    return this.records.remove(id);
  }
}

@ApiTags('finance: records')
@Controller('finance/fx-rates')
export class FxRatesController {
  constructor(private readonly records: RecordsService) {}

  @Get('last-used')
  @ApiOperation({
    operationId: 'listLastUsedRates',
    summary: 'The most recent exchange rate used per currency, to pre-fill the record form',
  })
  @ApiOkResponse({ type: LastUsedRateDto, isArray: true })
  lastUsed(): Promise<LastUsedRateDto[]> {
    return this.records.lastUsedRates();
  }
}
