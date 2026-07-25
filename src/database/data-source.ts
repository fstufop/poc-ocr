import { config as loadEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';

// Carrega o .env para o contexto da CLI do TypeORM (fora do runtime Nest).
loadEnv();

/**
 * DataSource usado exclusivamente pela CLI do TypeORM
 * (migration:generate / run / revert).
 *
 * O runtime da aplicação NÃO usa este arquivo — ele monta as opções via
 * DatabaseConfig (src/config/database.config.ts). Mantenha os dois alinhados.
 */
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'app',
  // Entities em todos os módulos. Glob resolve tanto .ts (ts-node) quanto .js (build).
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
