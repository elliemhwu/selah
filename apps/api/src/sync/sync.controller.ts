import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblems } from '../common/api-problems.decorator';
import { SyncChangesDto, SyncChangesQuery } from './sync.dto';
import { SyncService } from './sync.service';

@ApiTags('sync')
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('changes')
  @ApiOperation({
    operationId: 'getSyncChanges',
    summary: 'Every row changed since the cursor, deleted ones included (ADR 0028)',
  })
  @ApiOkResponse({ type: SyncChangesDto })
  @ApiProblems(400)
  changes(@Query() query: SyncChangesQuery): Promise<SyncChangesDto> {
    return this.sync.changes(query.since);
  }
}
