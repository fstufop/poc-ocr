import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { Cache } from 'cache-manager';

/**
 * Indicador de saúde do Redis. Faz um round-trip set/get numa chave de sonda
 * através do cache-manager para confirmar que o store remoto responde.
 * Segue o padrão de indicador customizado da doc do NestJS 11 (HealthIndicatorService).
 */
@Injectable()
export class RedisHealthIndicator {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);

    try {
      const probe = `health:probe:${key}`;
      await this.cache.set(probe, 'ok', 1000);
      const value = await this.cache.get<string>(probe);

      if (value !== 'ok') {
        return indicator.down({ reason: 'Resposta inesperada do cache' });
      }

      return indicator.up();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return indicator.down({ reason: message });
    }
  }
}
