import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ApiKeyGuard } from '../src/common/guards/api-key.guard';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TokenUsageController } from '../src/modules/token-usage/token-usage.controller';
import { TokenUsageService } from '../src/modules/token-usage/token-usage.service';

describe('TokenUsageController (e2e)', () => {
  let app: INestApplication;
  let mockTokenUsageService: { aggregate: jest.Mock };

  const mockAggregate = {
    from: '2026-07-01',
    to: '2026-07-28',
    totals: { requestCount: 5, inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    byEndpoint: [],
    byDay: [],
  };

  beforeAll(async () => {
    mockTokenUsageService = { aggregate: jest.fn().mockResolvedValue(mockAggregate) };

    const moduleRef = await Test.createTestingModule({
      controllers: [TokenUsageController],
      providers: [
        { provide: TokenUsageService, useValue: mockTokenUsageService },
        ApiKeyGuard,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: unknown) => {
              const map: Record<string, unknown> = { API_KEY: 'test-api-key' };
              return map[key] ?? def;
            }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockTokenUsageService.aggregate.mockReset();
    mockTokenUsageService.aggregate.mockResolvedValue(mockAggregate);
  });

  it('GET /api/token-usage sem X-Api-Key → 401', () => {
    return request(app.getHttpServer())
      .get('/api/token-usage')
      .expect(HttpStatus.UNAUTHORIZED);
  });

  it('GET /api/token-usage com chave errada → 403', () => {
    return request(app.getHttpServer())
      .get('/api/token-usage')
      .set('X-Api-Key', 'wrong')
      .expect(HttpStatus.FORBIDDEN);
  });

  it('GET /api/token-usage com chave válida → 200 com estrutura correta', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/token-usage')
      .set('X-Api-Key', 'test-api-key')
      .expect(HttpStatus.OK);

    expect(res.body).toMatchObject({
      from: expect.any(String),
      to: expect.any(String),
      totals: expect.objectContaining({
        requestCount: expect.any(Number),
        inputTokens: expect.any(Number),
        outputTokens: expect.any(Number),
        totalTokens: expect.any(Number),
      }),
      byEndpoint: expect.any(Array),
      byDay: expect.any(Array),
    });
  });

  it('GET /api/token-usage?from=invalid → 400', () => {
    return request(app.getHttpServer())
      .get('/api/token-usage?from=invalid')
      .set('X-Api-Key', 'test-api-key')
      .expect(HttpStatus.BAD_REQUEST);
  });
});
