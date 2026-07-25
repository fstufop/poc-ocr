/**
 * Configuração tipada e centralizada, exposta via ConfigService.
 * Ex.: configService.get('database.host', { infer: true })
 */
export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api',

  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_DATABASE ?? 'app',
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
  },

  cache: {
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    ttl: parseInt(process.env.CACHE_TTL ?? '60000', 10),
  },
});
