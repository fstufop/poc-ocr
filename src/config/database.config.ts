import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';

/**
 * Fábrica de opções do TypeORM. Reutiliza o mesmo objeto de configuração
 * usado pelo DataSource de migrations (src/database/data-source.ts) para
 * garantir consistência entre runtime e CLI.
 */
export function buildTypeOrmOptions(config: {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  synchronize: boolean;
  logging: boolean;
}): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: config.database,
    // Autoload das entities registradas via TypeOrmModule.forFeature()
    autoLoadEntities: true,
    synchronize: config.synchronize,
    logging: config.logging,
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    migrationsRun: false,
  };
}

@Injectable()
export class DatabaseConfig implements TypeOrmOptionsFactory {
  constructor(private readonly configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    return buildTypeOrmOptions({
      host: this.configService.getOrThrow<string>('database.host'),
      port: this.configService.getOrThrow<number>('database.port'),
      username: this.configService.getOrThrow<string>('database.username'),
      password: this.configService.getOrThrow<string>('database.password'),
      database: this.configService.getOrThrow<string>('database.database'),
      synchronize: this.configService.getOrThrow<boolean>(
        'database.synchronize',
      ),
      logging: this.configService.getOrThrow<boolean>('database.logging'),
    });
  }
}
