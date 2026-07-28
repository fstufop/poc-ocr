import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecordTokenUsageDto } from './dto/record-token-usage.dto';
import { TokenUsageQueryDto } from './dto/token-usage-query.dto';
import {
  DayAggregateDto,
  EndpointAggregateDto,
  TokenUsageResponseDto,
  TokenTotalsDto,
} from './dto/token-usage-response.dto';
import { TokenUsageRecord } from './entities/token-usage-record.entity';

@Injectable()
export class TokenUsageService {
  constructor(
    @InjectRepository(TokenUsageRecord)
    private readonly repo: Repository<TokenUsageRecord>,
  ) {}

  async record(dto: RecordTokenUsageDto): Promise<void> {
    await this.repo.save(this.repo.create(dto));
  }

  async aggregate(query: TokenUsageQueryDto): Promise<TokenUsageResponseDto> {
    const fromDisplay = query.from ?? this.daysAgo(30);
    const toDisplay = query.to ?? this.today();

    const from = new Date(fromDisplay);
    const toExclusive = new Date(toDisplay);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

    const endpointCondition = query.endpoint ? 'AND endpoint = $3' : '';
    const params: (Date | string)[] = [from, toExclusive];
    if (query.endpoint) params.push(query.endpoint);

    const results = await Promise.all([
      this.repo.query<TokenTotalsDto[]>(
        `SELECT COUNT(*)::int AS "requestCount",
                COALESCE(SUM(input_tokens), 0)::int AS "inputTokens",
                COALESCE(SUM(output_tokens), 0)::int AS "outputTokens",
                COALESCE(SUM(total_tokens), 0)::int AS "totalTokens"
         FROM token_usage
         WHERE created_at >= $1 AND created_at < $2 ${endpointCondition}`,
        params,
      ),
      this.repo.query<EndpointAggregateDto[]>(
        `SELECT endpoint,
                COUNT(*)::int AS "requestCount",
                COALESCE(SUM(input_tokens), 0)::int AS "inputTokens",
                COALESCE(SUM(output_tokens), 0)::int AS "outputTokens",
                COALESCE(SUM(total_tokens), 0)::int AS "totalTokens"
         FROM token_usage
         WHERE created_at >= $1 AND created_at < $2 ${endpointCondition}
         GROUP BY endpoint`,
        params,
      ),
      this.repo.query<DayAggregateDto[]>(
        `SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS date,
                COUNT(*)::int AS "requestCount",
                COALESCE(SUM(input_tokens), 0)::int AS "inputTokens",
                COALESCE(SUM(output_tokens), 0)::int AS "outputTokens",
                COALESCE(SUM(total_tokens), 0)::int AS "totalTokens"
         FROM token_usage
         WHERE created_at >= $1 AND created_at < $2 ${endpointCondition}
         GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
         ORDER BY date`,
        params,
      ),
    ]);
    const totalsResult: TokenTotalsDto[] = results[0];
    const byEndpointResult: EndpointAggregateDto[] = results[1];
    const byDayResult: DayAggregateDto[] = results[2];

    const zero: TokenTotalsDto = {
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };

    return {
      from: fromDisplay,
      to: toDisplay,
      totals: totalsResult[0] ?? zero,
      byEndpoint: byEndpointResult,
      byDay: byDayResult,
    };
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private daysAgo(n: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }
}
