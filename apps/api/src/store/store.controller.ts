import { Body, Controller, Get, HttpCode, Patch, Put } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblems } from '../common/api-problems.decorator';
import { StoreChangesDto, StoreSnapshotDto } from './store.dto';
import { StoreService } from './store.service';

@ApiTags('store')
@Controller('store')
export class StoreController {
  constructor(private readonly store: StoreService) {}

  @Get()
  @ApiOperation({ operationId: 'loadStore', summary: 'Every stored row, deleted ones included' })
  @ApiOkResponse({ type: StoreSnapshotDto })
  load(): Promise<StoreSnapshotDto> {
    return this.store.load();
  }

  @Patch()
  @HttpCode(204)
  @ApiOperation({
    operationId: 'saveStoreChanges',
    summary: 'Create or replace rows, by table, all or nothing',
    description: 'Each row replaces the stored row with its id. A record or plan version replaces its lines or items.',
  })
  @ApiNoContentResponse({ description: 'Saved.' })
  @ApiProblems(400, 409, 422)
  save(@Body() changes: StoreChangesDto): Promise<void> {
    return this.store.save(changes);
  }

  @Put()
  @HttpCode(204)
  @ApiOperation({ operationId: 'replaceStore', summary: 'Replace everything, such as when restoring a backup' })
  @ApiNoContentResponse({ description: 'Replaced.' })
  @ApiProblems(400, 409, 422)
  replace(@Body() snapshot: StoreSnapshotDto): Promise<void> {
    return this.store.replace(snapshot);
  }
}
