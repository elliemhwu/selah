import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthDto } from './health.dto';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ operationId: 'getHealth', summary: 'API and database status' })
  @ApiOkResponse({ type: HealthDto })
  check(): Promise<HealthDto> {
    return this.health.check();
  }
}
