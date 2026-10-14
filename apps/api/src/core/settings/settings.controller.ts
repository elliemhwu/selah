import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblems } from '../../common/api-problems.decorator';
import { SettingsDto, UpdateSettingsDto } from './settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('core: settings')
@Controller('core/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({ operationId: 'getSettings', summary: 'The app settings, or the defaults if never saved' })
  @ApiOkResponse({ type: SettingsDto })
  get(): Promise<SettingsDto> {
    return this.settings.get();
  }

  @Put()
  @ApiOperation({ operationId: 'updateSettings', summary: 'Replace the app settings (a single resource, no id)' })
  @ApiOkResponse({ type: SettingsDto })
  @ApiProblems(400)
  update(@Body() body: UpdateSettingsDto): Promise<SettingsDto> {
    return this.settings.update(body);
  }
}
