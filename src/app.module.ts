import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisCacheModule } from './cache/cache.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { DatabaseConfig } from './config/database.config';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useClass: DatabaseConfig,
      inject: [ConfigService],
    }),
    RedisCacheModule,
    HealthModule,
    // Módulos de domínio
    UsersModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
