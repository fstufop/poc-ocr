import KeyvRedis from '@keyv/redis';
import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheableMemory } from 'cacheable';
import { Keyv } from 'keyv';

/**
 * Cache global de dois níveis (padrão da doc do NestJS 11):
 *  1. Memória local (LRU) — respostas ultra-rápidas por instância
 *  2. Redis compartilhado — consistente entre múltiplas instâncias
 *
 * Injete com `@Inject(CACHE_MANAGER) private cache: Cache` em qualquer service.
 */
@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.getOrThrow<string>('cache.redisUrl');
        const ttl = configService.getOrThrow<number>('cache.ttl');

        return {
          ttl,
          stores: [
            new Keyv({
              store: new CacheableMemory({ ttl, lruSize: 5000 }),
            }),
            new Keyv({
              store: new KeyvRedis(redisUrl),
            }),
          ],
        };
      },
    }),
  ],
  exports: [CacheModule],
})
export class RedisCacheModule {}
