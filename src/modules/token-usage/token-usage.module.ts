import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { TokenUsageRecord } from './entities/token-usage-record.entity';
import { TokenUsageController } from './token-usage.controller';
import { TokenUsageService } from './token-usage.service';

@Module({
  imports: [TypeOrmModule.forFeature([TokenUsageRecord])],
  controllers: [TokenUsageController],
  providers: [TokenUsageService, ApiKeyGuard],
  exports: [TokenUsageService],
})
export class TokenUsageModule {}
