import { Module } from '@nestjs/common';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';

/** The generic row store for every module's tables (ADR 0029). */
@Module({
  controllers: [StoreController],
  providers: [StoreService],
})
export class StoreModule {}
