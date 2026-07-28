import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { AI_PROVIDER } from '../src/ai/ai-provider.port';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { AnalyzeModule } from '../src/modules/analyze/analyze.module';

describe('AnalyzeController (e2e)', () => {
  let app: INestApplication;
  let mockAiProvider: { analyze: jest.Mock };

  const API_KEY = 'test-api-key';
  const jpegFixture = readFileSync(
    join(__dirname, 'fixtures/sample-receipt.jpg'),
  );
  const pdfFixture = readFileSync(
    join(__dirname, 'fixtures/sample-receipt.pdf'),
  );

  const wrapAiResult = <T>(data: T) => ({
    data,
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  });

  beforeAll(async () => {
    mockAiProvider = { analyze: jest.fn() };

    const mockConfigService = {
      get: jest.fn((key: string, def?: unknown) => {
        const map: Record<string, unknown> = {
          API_KEY,
          AUDIO_MAX_SIZE_MB: 25,
          IMAGE_MAX_SIZE_MB: 10,
          PDF_MAX_SIZE_MB: 20,
          GEMINI_MODEL: 'gemini-1.5-flash',
        };
        return map[key] ?? def;
      }),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          isGlobal: true,
        }),
        AnalyzeModule,
      ],
    })
      .overrideProvider(AI_PROVIDER)
      .useValue(mockAiProvider)
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockAiProvider.analyze.mockReset();
  });

  describe('POST /api/analyze/medicines', () => {
    it('401 quando X-Api-Key está ausente', () => {
      return request(app.getHttpServer())
        .post('/api/analyze/medicines')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('403 quando X-Api-Key é inválida', () => {
      return request(app.getHttpServer())
        .post('/api/analyze/medicines')
        .set('X-Api-Key', 'wrong')
        .expect(HttpStatus.FORBIDDEN);
    });

    it('400 quando nenhum arquivo é enviado', () => {
      return request(app.getHttpServer())
        .post('/api/analyze/medicines')
        .set('X-Api-Key', API_KEY)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('422 quando MIME type não é suportado', () => {
      return request(app.getHttpServer())
        .post('/api/analyze/medicines')
        .set('X-Api-Key', API_KEY)
        .attach('file', Buffer.from('plain text'), {
          filename: 'file.txt',
          contentType: 'text/plain',
        })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('200 com medicines ao enviar JPEG', async () => {
      const expected = {
        medicines: [{ name: 'Amoxicilina', dosage: '500mg', frequency: '8h' }],
      };
      mockAiProvider.analyze.mockResolvedValue(wrapAiResult(expected));

      return request(app.getHttpServer())
        .post('/api/analyze/medicines')
        .set('X-Api-Key', API_KEY)
        .attach('file', jpegFixture, {
          filename: 'receipt.jpg',
          contentType: 'image/jpeg',
        })
        .expect(HttpStatus.OK)
        .expect(expected);
    });

    it('200 com medicines ao enviar PDF', async () => {
      const expected = {
        medicines: [{ name: 'Dipirona', dosage: '1g', frequency: '6h' }],
      };
      mockAiProvider.analyze.mockResolvedValue(wrapAiResult(expected));

      return request(app.getHttpServer())
        .post('/api/analyze/medicines')
        .set('X-Api-Key', API_KEY)
        .attach('file', pdfFixture, {
          filename: 'receipt.pdf',
          contentType: 'application/pdf',
        })
        .expect(HttpStatus.OK)
        .expect(expected);
    });
  });

  describe('POST /api/analyze/vaccines', () => {
    it('200 com vaccines ao enviar JPEG', async () => {
      const expected = {
        vaccines: [{ name: 'BCG', date: '2020-01-15', dose: 'única' }],
      };
      mockAiProvider.analyze.mockResolvedValue(wrapAiResult(expected));

      return request(app.getHttpServer())
        .post('/api/analyze/vaccines')
        .set('X-Api-Key', API_KEY)
        .attach('file', jpegFixture, {
          filename: 'vaccine-card.jpg',
          contentType: 'image/jpeg',
        })
        .expect(HttpStatus.OK)
        .expect(expected);
    });
  });
});
