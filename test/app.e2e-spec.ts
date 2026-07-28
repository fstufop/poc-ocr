import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Smoke test de boot. Requer PostgreSQL e Redis acessíveis
 * (ver docker-compose.yml). Rode com `npm run test:e2e`.
 */
describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health (GET) retorna status ok', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    const body = res.body as { status: string };
    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
  });
});
