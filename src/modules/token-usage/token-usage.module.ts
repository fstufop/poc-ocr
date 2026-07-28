import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenUsageRecord } from './entities/token-usage-record.entity';
import { TokenUsageService } from './token-usage.service';

@Module({
  imports: [TypeOrmModule.forFeature([TokenUsageRecord])],
  providers: [TokenUsageService],
  exports: [TokenUsageService],
})
export class TokenUsageModule {}
