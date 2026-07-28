export class RecordTokenUsageDto {
  endpoint: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}
