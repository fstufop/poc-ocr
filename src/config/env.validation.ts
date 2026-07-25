import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Schema das variáveis de ambiente. É validado no boot da aplicação —
 * se algo obrigatório faltar ou tiver tipo inválido, o processo não sobe.
 */
export class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  PORT = 3000;

  @IsString()
  @IsOptional()
  API_PREFIX = 'api';

  // ---- Banco de dados ----
  @IsString()
  DB_HOST: string;

  @IsInt()
  @Min(0)
  @Max(65535)
  DB_PORT: number;

  @IsString()
  DB_USERNAME: string;

  @IsString()
  DB_PASSWORD: string;

  @IsString()
  DB_DATABASE: string;

  @IsBoolean()
  @IsOptional()
  DB_SYNCHRONIZE = false;

  @IsBoolean()
  @IsOptional()
  DB_LOGGING = false;

  // ---- Cache / Redis ----
  @IsString()
  REDIS_URL: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  CACHE_TTL = 60000;
}

/**
 * Usado como `validate` no ConfigModule.forRoot().
 * Converte strings do .env para os tipos corretos e valida.
 */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Falha na validação das variáveis de ambiente:\n${errors.toString()}`,
    );
  }

  return validatedConfig;
}
