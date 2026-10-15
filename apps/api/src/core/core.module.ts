import { Module } from '@nestjs/common';
import { SettingsController } from './settings/settings.controller';
import { SettingsRepository } from './settings/settings.repository';
import { SettingsService } from './settings/settings.service';

/** App-wide data that belongs to no module, in the `core` schema (ADR 0003). */
@Module({
  controllers: [SettingsController],
  providers: [SettingsRepository, SettingsService],
  exports: [SettingsRepository],
})
export class CoreModule {}
