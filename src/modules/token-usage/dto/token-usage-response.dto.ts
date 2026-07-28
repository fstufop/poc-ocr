export class TokenTotalsDto {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export class EndpointAggregateDto {
  endpoint: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export class DayAggregateDto {
  date: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export class TokenUsageResponseDto {
  from: string;
  to: string;
  totals: TokenTotalsDto;
  byEndpoint: EndpointAggregateDto[];
  byDay: DayAggregateDto[];
}
