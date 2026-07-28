import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { TokenUsageQueryDto } from './dto/token-usage-query.dto';
import { TokenUsageResponseDto } from './dto/token-usage-response.dto';
import { TokenUsageService } from './token-usage.service';

@Controller('token-usage')
@UseGuards(ApiKeyGuard)
export class TokenUsageController {
  constructor(private readonly tokenUsageService: TokenUsageService) {}

  @Get()
  aggregate(
    @Query() query: TokenUsageQueryDto,
  ): Promise<TokenUsageResponseDto> {
    return this.tokenUsageService.aggregate(query);
  }
}
