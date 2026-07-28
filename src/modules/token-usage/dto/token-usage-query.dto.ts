import { IsDateString, IsOptional, IsString } from 'class-validator';

export class TokenUsageQueryDto {
  @IsDateString()
  @IsOptional()
  from?: string;

  @IsDateString()
  @IsOptional()
  to?: string;

  @IsString()
  @IsOptional()
  endpoint?: string;
}
