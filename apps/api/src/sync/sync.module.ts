import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { FinanceModule } from '../finance/finance.module';
import { SyncController } from './sync.controller';
import { SyncRepository } from './sync.repository';
import { SyncService } from './sync.service';

/** Pulling changes for devices (ADR 0028); pushes use the modules' own endpoints. */
@Module({
  imports: [CoreModule, FinanceModule],
  controllers: [SyncController],
  providers: [SyncRepository, SyncService],
})
export class SyncModule {}
