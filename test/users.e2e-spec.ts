import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * e2e do módulo Users. Requer PostgreSQL e Redis (ver docker-compose.yml).
 */
describe('Users (e2e)', () => {
  let app: INestApplication;
  let createdId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /users cria um usuário', async () => {
    const res = await request(app.getHttpServer())
      .post('/users')
      .send({ name: 'Ada Lovelace', email: `ada+${Date.now()}@example.com` });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    createdId = res.body.id as string;
  });

  it('POST /users rejeita payload inválido com 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/users')
      .send({ name: 'X', email: 'nao-e-email' });

    expect(res.status).toBe(400);
  });

  it('GET /users/:id retorna o usuário criado', async () => {
    const res = await request(app.getHttpServer()).get(`/users/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdId);
  });

  it('GET /users/:id com uuid inexistente retorna 404', async () => {
    const res = await request(app.getHttpServer()).get(
      '/users/00000000-0000-0000-0000-000000000000',
    );
    expect(res.status).toBe(404);
  });

  it('DELETE /users/:id remove o usuário', async () => {
    const res = await request(app.getHttpServer()).delete(
      `/users/${createdId}`,
    );
    expect(res.status).toBe(204);
  });
});
