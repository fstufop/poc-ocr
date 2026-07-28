# Token Usage Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar o uso de tokens da LLM por request de forma assíncrona e expor `GET /api/token-usage` com agregação por período e por endpoint.

**Architecture:** Estende `AIProviderPort.analyze()` para retornar `{ data: T; tokenUsage: TokenUsage }`, fazendo `GeminiAdapter` extrair `usageMetadata` da resposta Gemini. `AnalyzeService` desestrutura o resultado, chama `TokenUsageService.record()` fire-and-forget e retorna só `data`. `TokenUsageModule` persiste no PostgreSQL e expõe `GET /token-usage`.

**Tech Stack:** NestJS 11, TypeORM 0.3, PostgreSQL, class-validator, Jest/supertest

## Global Constraints

- NestJS 11, Node 22, TypeScript, CommonJS — sem ESM
- `synchronize: false` — mudanças de schema via migration versionada
- Injeção via construtor; nunca `new` para dependências
- `Logger` do NestJS — nunca `console.log`
- Falha no `record()` deve ser logada mas não afetar a resposta ao cliente
- `GET /api/token-usage` protegido por `ApiKeyGuard` (mesmo header `X-Api-Key`)
- `npm run build && npm run lint && npm run test` devem passar após cada task

---

### Task 1: Extend AI provider interface through the call chain

Estende `AIProviderPort`, atualiza `GeminiAdapter`, `IProcessor`, os 3 processors e `AnalyzeService`. Nesta task, `AnalyzeService` apenas desestrutura `{ data }` — o `record()` será conectado na Task 3. O build deve ficar verde ao final desta task.

**Files:**
- Modify: `src/ai/ai-provider.port.ts`
- Modify: `src/ai/adapters/gemini.adapter.ts`
- Modify: `src/ai/adapters/gemini.adapter.spec.ts`
- Modify: `src/modules/analyze/interfaces/processor.interface.ts`
- Modify: `src/modules/analyze/processors/audio.processor.ts`
- Modify: `src/modules/analyze/processors/image.processor.ts`
- Modify: `src/modules/analyze/processors/pdf.processor.ts`
- Modify: `src/modules/analyze/processors/audio.processor.spec.ts`
- Modify: `src/modules/analyze/processors/image.processor.spec.ts`
- Modify: `src/modules/analyze/processors/pdf.processor.spec.ts`
- Modify: `src/modules/analyze/analyze.service.ts`
- Modify: `src/modules/analyze/analyze.service.spec.ts`

**Interfaces:**
- Produces: `TokenUsage { inputTokens: number; outputTokens: number; totalTokens: number }` — usado nas Tasks 2 e 3
- Produces: `AIProviderPort.analyze<T>(): Promise<{ data: T; tokenUsage: TokenUsage }>` — usado pelos processors
- Produces: `IProcessor.extract<T>(): Promise<{ data: T; tokenUsage: TokenUsage }>` — usado por `AnalyzeService`

- [ ] **Step 1: Adicionar `TokenUsage` e atualizar `AIProviderPort`**

Substitua o conteúdo de `src/ai/ai-provider.port.ts`:

```typescript
export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface AIAnalysisInput {
  fileBuffer: Buffer;
  mimeType: string;
  prompt: string;
  responseSchema: object;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AIProviderPort {
  analyze<T>(input: AIAnalysisInput): Promise<{ data: T; tokenUsage: TokenUsage }>;
}
```

- [ ] **Step 2: Atualizar `GeminiAdapter` para extrair `usageMetadata`**

Substitua o conteúdo de `src/ai/adapters/gemini.adapter.ts`:

```typescript
import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
  AIAnalysisInput,
  AIProviderPort,
  TokenUsage,
} from '../ai-provider.port';

@Injectable()
export class GeminiAdapter implements AIProviderPort {
  private readonly logger = new Logger(GeminiAdapter.name);
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.client = new GoogleGenAI({
      apiKey: this.config.get<string>('GEMINI_API_KEY'),
    });
    this.model = this.config.get<string>('GEMINI_MODEL', 'gemini-1.5-flash');
    this.timeoutMs = this.config.get<number>('AI_TIMEOUT_MS', 30000);
  }

  async analyze<T>(
    input: AIAnalysisInput,
  ): Promise<{ data: T; tokenUsage: TokenUsage }> {
    const base64 = input.fileBuffer.toString('base64');

    const responsePromise = this.client.models.generateContent({
      model: this.model,
      contents: [
        {
          parts: [
            { text: input.prompt },
            { inlineData: { mimeType: input.mimeType, data: base64 } },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: input.responseSchema,
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new GatewayTimeoutException('AI provider timed out')),
        this.timeoutMs,
      ),
    );

    const response = await Promise.race([responsePromise, timeoutPromise]);

    if (!response.text) {
      throw new BadGatewayException(
        'AI provider returned an unexpected response',
      );
    }

    this.logger.debug(`Gemini raw response: ${response.text.slice(0, 120)}`);

    const usage = response.usageMetadata;
    const tokenUsage: TokenUsage = {
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
      totalTokens: usage?.totalTokenCount ?? 0,
    };

    return { data: JSON.parse(response.text) as T, tokenUsage };
  }
}
```

- [ ] **Step 3: Atualizar `gemini.adapter.spec.ts`**

Substitua o conteúdo de `src/ai/adapters/gemini.adapter.spec.ts`:

```typescript
import { BadGatewayException, GatewayTimeoutException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { GoogleGenAI } from '@google/genai';
import { GeminiAdapter } from './gemini.adapter';

jest.mock('@google/genai');

describe('GeminiAdapter', () => {
  let adapter: GeminiAdapter;
  let mockGenerateContent: jest.Mock;

  const buildInput = () => ({
    fileBuffer: Buffer.from('fake-content'),
    mimeType: 'image/jpeg',
    prompt: 'Extract data',
    responseSchema: {
      type: 'object',
      properties: { result: { type: 'string' } },
    },
  });

  beforeEach(async () => {
    mockGenerateContent = jest.fn();
    (GoogleGenAI as jest.Mock).mockImplementation(() => ({
      models: { generateContent: mockGenerateContent },
    }));

    const module = await Test.createTestingModule({
      providers: [
        GeminiAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: unknown) => {
              const map: Record<string, unknown> = {
                GEMINI_API_KEY: 'test-key',
                GEMINI_MODEL: 'gemini-1.5-flash',
                AI_TIMEOUT_MS: 50,
              };
              return map[key] ?? def;
            }),
          },
        },
      ],
    }).compile();

    adapter = module.get(GeminiAdapter);
  });

  it('retorna data parseado e tokenUsage extraído do usageMetadata', async () => {
    mockGenerateContent.mockResolvedValue({
      text: '{"result":"ok"}',
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    });

    const result = await adapter.analyze<{ result: string }>(buildInput());

    expect(result.data).toEqual({ result: 'ok' });
    expect(result.tokenUsage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    });
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-1.5-flash' }),
    );
  });

  it('retorna tokenUsage com zeros quando usageMetadata está ausente', async () => {
    mockGenerateContent.mockResolvedValue({ text: '{"result":"ok"}' });

    const result = await adapter.analyze<{ result: string }>(buildInput());

    expect(result.tokenUsage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
  });

  it('lança BadGatewayException quando a resposta está vazia', async () => {
    mockGenerateContent.mockResolvedValue({ text: '' });

    await expect(adapter.analyze(buildInput())).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('lança GatewayTimeoutException quando excede AI_TIMEOUT_MS', async () => {
    mockGenerateContent.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ text: '{}' }), 200),
        ),
    );

    await expect(adapter.analyze(buildInput())).rejects.toBeInstanceOf(
      GatewayTimeoutException,
    );
  }, 5000);
});
```

- [ ] **Step 4: Atualizar `IProcessor` em `processor.interface.ts`**

Substitua o conteúdo de `src/modules/analyze/interfaces/processor.interface.ts`:

```typescript
import { TokenUsage } from '../../../ai/ai-provider.port';

export interface AnalysisContext {
  prompt: string;
  responseSchema: object;
}

export interface IProcessor {
  extract<T>(
    file: Express.Multer.File,
    context: AnalysisContext,
  ): Promise<{ data: T; tokenUsage: TokenUsage }>;
}
```

- [ ] **Step 5: Atualizar os 3 processors**

Substitua o conteúdo de `src/modules/analyze/processors/audio.processor.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import {
  AI_PROVIDER,
  AIProviderPort,
  TokenUsage,
} from '../../../ai/ai-provider.port';
import { AnalysisContext, IProcessor } from '../interfaces/processor.interface';

@Injectable()
export class AudioProcessor implements IProcessor {
  constructor(
    @Inject(AI_PROVIDER)
    private readonly aiProvider: AIProviderPort,
  ) {}

  extract<T>(
    file: Express.Multer.File,
    context: AnalysisContext,
  ): Promise<{ data: T; tokenUsage: TokenUsage }> {
    return this.aiProvider.analyze<T>({
      fileBuffer: file.buffer,
      mimeType: file.mimetype,
      prompt: context.prompt,
      responseSchema: context.responseSchema,
    });
  }
}
```

Repita o mesmo para `image.processor.ts` (troque `AudioProcessor` por `ImageProcessor`) e `pdf.processor.ts` (troque por `PdfProcessor`) — o corpo é idêntico.

- [ ] **Step 6: Atualizar `audio.processor.spec.ts`**

Substitua o conteúdo de `src/modules/analyze/processors/audio.processor.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { AI_PROVIDER } from '../../../ai/ai-provider.port';
import { AudioProcessor } from './audio.processor';

describe('AudioProcessor', () => {
  let processor: AudioProcessor;
  let aiProvider: { analyze: jest.Mock };

  const buildFile = (): Express.Multer.File =>
    ({
      buffer: Buffer.from('audio-data'),
      mimetype: 'audio/mpeg',
    }) as Express.Multer.File;

  const buildContext = () => ({
    prompt: 'Extract medicines from audio',
    responseSchema: { type: 'object' },
  });

  const buildTokenUsage = () => ({
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
  });

  beforeEach(async () => {
    aiProvider = { analyze: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        AudioProcessor,
        { provide: AI_PROVIDER, useValue: aiProvider },
      ],
    }).compile();

    processor = module.get(AudioProcessor);
  });

  it('chama AIProviderPort com fileBuffer, mimeType, prompt e responseSchema corretos', async () => {
    const file = buildFile();
    const context = buildContext();
    aiProvider.analyze.mockResolvedValue({
      data: { medicines: [] },
      tokenUsage: buildTokenUsage(),
    });

    await processor.extract(file, context);

    expect(aiProvider.analyze).toHaveBeenCalledWith({
      fileBuffer: file.buffer,
      mimeType: file.mimetype,
      prompt: context.prompt,
      responseSchema: context.responseSchema,
    });
  });

  it('retorna { data, tokenUsage } do AIProviderPort', async () => {
    const expected = {
      data: { medicines: [{ name: 'Amoxicilina' }] },
      tokenUsage: buildTokenUsage(),
    };
    aiProvider.analyze.mockResolvedValue(expected);

    const result = await processor.extract(buildFile(), buildContext());

    expect(result).toEqual(expected);
  });
});
```

Repita o padrão para `image.processor.spec.ts` (troque `AudioProcessor`/`audio.processor` por `ImageProcessor`/`image.processor` e use `mimetype: 'image/jpeg'`) e para `pdf.processor.spec.ts` (use `PdfProcessor`/`pdf.processor` e `mimetype: 'application/pdf'`).

- [ ] **Step 7: Atualizar `AnalyzeService` para desestruturar `{ data }`**

Substitua apenas os métodos `analyzeMedicines` e `analyzeVaccines` em `src/modules/analyze/analyze.service.ts`:

```typescript
async analyzeMedicines(
  file: Express.Multer.File,
): Promise<MedicinesAnalysisDto> {
  this.validateFile(file);
  const processor = this.resolveProcessor(file.mimetype);
  this.logger.log(`Analyzing medicines — mimeType: ${file.mimetype}`);
  const { data } = await processor.extract<MedicinesAnalysisDto>(
    file,
    MedicinesContext,
  );
  return data;
}

async analyzeVaccines(
  file: Express.Multer.File,
): Promise<VaccinesAnalysisDto> {
  this.validateFile(file);
  const processor = this.resolveProcessor(file.mimetype);
  this.logger.log(`Analyzing vaccines — mimeType: ${file.mimetype}`);
  const { data } = await processor.extract<VaccinesAnalysisDto>(
    file,
    VaccinesContext,
  );
  return data;
}
```

- [ ] **Step 8: Atualizar `analyze.service.spec.ts` para o novo formato de retorno**

Os mocks dos processors precisam retornar `{ data, tokenUsage }`. Substitua todas as linhas `.mockResolvedValue(expected)` e `.mockResolvedValue({ medicines: [] })` / `.mockResolvedValue({ vaccines: [...] })` pelo formato wrapeado. Exemplo completo do arquivo:

```typescript
import {
  BadRequestException,
  HttpStatus,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MedicinesContext } from './contexts/medicines.context';
import { VaccinesContext } from './contexts/vaccines.context';
import { AnalyzeService } from './analyze.service';
import { AudioProcessor } from './processors/audio.processor';
import { ImageProcessor } from './processors/image.processor';
import { PdfProcessor } from './processors/pdf.processor';

describe('AnalyzeService', () => {
  let service: AnalyzeService;
  let audioProcessor: { extract: jest.Mock };
  let imageProcessor: { extract: jest.Mock };
  let pdfProcessor: { extract: jest.Mock };

  const buildFile = (
    overrides: Partial<Express.Multer.File> = {},
  ): Express.Multer.File =>
    ({
      fieldname: 'file',
      originalname: 'test.jpg',
      mimetype: 'image/jpeg',
      size: 1024,
      buffer: Buffer.from('data'),
      ...overrides,
    }) as Express.Multer.File;

  const wrapResult = <T>(data: T) => ({
    data,
    tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  });

  beforeEach(async () => {
    audioProcessor = { extract: jest.fn() };
    imageProcessor = { extract: jest.fn() };
    pdfProcessor = { extract: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        AnalyzeService,
        { provide: AudioProcessor, useValue: audioProcessor },
        { provide: ImageProcessor, useValue: imageProcessor },
        { provide: PdfProcessor, useValue: pdfProcessor },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: unknown) => {
              const map: Record<string, unknown> = {
                AUDIO_MAX_SIZE_MB: 25,
                IMAGE_MAX_SIZE_MB: 10,
                PDF_MAX_SIZE_MB: 20,
                GEMINI_MODEL: 'gemini-1.5-flash',
              };
              return map[key] ?? def;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(AnalyzeService);
  });

  describe('analyzeMedicines', () => {
    it('roteia image/jpeg para ImageProcessor com MedicinesContext', async () => {
      const file = buildFile({ mimetype: 'image/jpeg' });
      const expected = {
        medicines: [{ name: 'Amoxicilina', dosage: '500mg', frequency: '8h' }],
      };
      imageProcessor.extract.mockResolvedValue(wrapResult(expected));

      const result = await service.analyzeMedicines(file);

      expect(imageProcessor.extract).toHaveBeenCalledWith(
        file,
        MedicinesContext,
      );
      expect(result).toEqual(expected);
    });

    it('roteia audio/mpeg para AudioProcessor', async () => {
      const file = buildFile({ mimetype: 'audio/mpeg' });
      audioProcessor.extract.mockResolvedValue(wrapResult({ medicines: [] }));

      await service.analyzeMedicines(file);

      expect(audioProcessor.extract).toHaveBeenCalledWith(
        file,
        MedicinesContext,
      );
    });

    it('roteia application/pdf para PdfProcessor', async () => {
      const file = buildFile({ mimetype: 'application/pdf' });
      pdfProcessor.extract.mockResolvedValue(wrapResult({ medicines: [] }));

      await service.analyzeMedicines(file);

      expect(pdfProcessor.extract).toHaveBeenCalledWith(file, MedicinesContext);
    });

    it('lança BadRequestException quando file é undefined', async () => {
      await expect(
        service.analyzeMedicines(undefined as unknown as Express.Multer.File),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lança UnprocessableEntityException para MIME type não suportado', async () => {
      const file = buildFile({ mimetype: 'text/plain' });

      await expect(service.analyzeMedicines(file)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('lança HttpException 413 quando arquivo excede o limite configurado', async () => {
      const file = buildFile({
        mimetype: 'image/jpeg',
        size: 11 * 1024 * 1024,
      });

      await expect(service.analyzeMedicines(file)).rejects.toMatchObject({
        status: HttpStatus.PAYLOAD_TOO_LARGE,
      });
    });
  });

  describe('analyzeVaccines', () => {
    it('roteia image/png para ImageProcessor com VaccinesContext', async () => {
      const file = buildFile({ mimetype: 'image/png' });
      const expected = {
        vaccines: [{ name: 'BCG', date: '2020-01-01', dose: 'única' }],
      };
      imageProcessor.extract.mockResolvedValue(wrapResult(expected));

      const result = await service.analyzeVaccines(file);

      expect(imageProcessor.extract).toHaveBeenCalledWith(
        file,
        VaccinesContext,
      );
      expect(result).toEqual(expected);
    });
  });
});
```

- [ ] **Step 9: Atualizar `test/analyze.e2e-spec.ts` para o novo formato do mock de AI_PROVIDER**

O mock de `AI_PROVIDER` retorna o valor diretamente para o processor. Como `AIProviderPort.analyze()` agora retorna `{ data, tokenUsage }`, o mock precisa ser atualizado. Substitua as 3 ocorrências de `mockAiProvider.analyze.mockResolvedValue(expected)` (e a análoga de vaccines) pelo formato wrapeado:

```typescript
// antes (3 ocorrências a substituir):
mockAiProvider.analyze.mockResolvedValue(expected);

// depois:
mockAiProvider.analyze.mockResolvedValue({
  data: expected,
  tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
});
```

O arquivo completo atualizado de `test/analyze.e2e-spec.ts`:

```typescript
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
```

- [ ] **Step 10: Verificar que os testes passam (unit + e2e de analyze)**

```bash
npm run build && npm run test && npm run test:e2e -- --testPathPattern=analyze
```

Esperado: build verde, 28+ unit tests passando, 7 e2e de analyze passando.

- [ ] **Step 11: Commit**

```bash
git add src/ai/ai-provider.port.ts \
        src/ai/adapters/gemini.adapter.ts \
        src/ai/adapters/gemini.adapter.spec.ts \
        src/modules/analyze/interfaces/processor.interface.ts \
        src/modules/analyze/processors/audio.processor.ts \
        src/modules/analyze/processors/image.processor.ts \
        src/modules/analyze/processors/pdf.processor.ts \
        src/modules/analyze/processors/audio.processor.spec.ts \
        src/modules/analyze/processors/image.processor.spec.ts \
        src/modules/analyze/processors/pdf.processor.spec.ts \
        src/modules/analyze/analyze.service.ts \
        src/modules/analyze/analyze.service.spec.ts \
        test/analyze.e2e-spec.ts
git commit -m "feat: extend AIProviderPort to return tokenUsage alongside data"
```

---

### Task 2: TokenUsageModule — entity, migration, DTOs, service

Cria o módulo de observabilidade completo: entidade TypeORM, migration, DTOs e service com `record()` e `aggregate()`. Não toca em `AnalyzeModule` ainda — o wiring acontece na Task 3.

**Files:**
- Create: `src/modules/token-usage/entities/token-usage-record.entity.ts`
- Create: `src/database/migrations/1785196800000-CreateTokenUsageTable.ts`
- Create: `src/modules/token-usage/dto/record-token-usage.dto.ts`
- Create: `src/modules/token-usage/dto/token-usage-query.dto.ts`
- Create: `src/modules/token-usage/dto/token-usage-response.dto.ts`
- Create: `src/modules/token-usage/token-usage.service.ts`
- Create: `src/modules/token-usage/token-usage.service.spec.ts`
- Create: `src/modules/token-usage/token-usage.module.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores (módulo autossuficiente)
- Produces: `TokenUsageService` com `record(dto: RecordTokenUsageDto): Promise<void>` e `aggregate(query: TokenUsageQueryDto): Promise<TokenUsageResponseDto>` — usado nas Tasks 3
- Produces: `TokenUsageModule` exportando `TokenUsageService`

- [ ] **Step 1: Criar a entidade `TokenUsageRecord`**

Crie `src/modules/token-usage/entities/token-usage-record.entity.ts`:

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('token_usage')
export class TokenUsageRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  endpoint: string;

  @Column({ length: 50 })
  provider: string;

  @Column({ length: 100 })
  model: string;

  @Column({ name: 'input_tokens', type: 'int' })
  inputTokens: number;

  @Column({ name: 'output_tokens', type: 'int' })
  outputTokens: number;

  @Column({ name: 'total_tokens', type: 'int' })
  totalTokens: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
```

- [ ] **Step 2: Criar a migration**

Crie `src/database/migrations/1785196800000-CreateTokenUsageTable.ts`:

```typescript
import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateTokenUsageTable1785196800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'token_usage',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'endpoint', type: 'varchar', length: '255' },
          { name: 'provider', type: 'varchar', length: '50' },
          { name: 'model', type: 'varchar', length: '100' },
          { name: 'input_tokens', type: 'integer' },
          { name: 'output_tokens', type: 'integer' },
          { name: 'total_tokens', type: 'integer' },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('token_usage');
  }
}
```

- [ ] **Step 3: Criar os DTOs**

Crie `src/modules/token-usage/dto/record-token-usage.dto.ts`:

```typescript
export class RecordTokenUsageDto {
  endpoint: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}
```

Crie `src/modules/token-usage/dto/token-usage-query.dto.ts`:

```typescript
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class TokenUsageQueryDto {
  @IsDateString()
  @IsOptional()
  from?: string;

  @IsDateString()
  @IsOptional()
  to?: string;

  @IsString()
  @IsOptional()
  endpoint?: string;
}
```

Crie `src/modules/token-usage/dto/token-usage-response.dto.ts`:

```typescript
export class TokenTotalsDto {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export class EndpointAggregateDto {
  endpoint: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export class DayAggregateDto {
  date: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export class TokenUsageResponseDto {
  from: string;
  to: string;
  totals: TokenTotalsDto;
  byEndpoint: EndpointAggregateDto[];
  byDay: DayAggregateDto[];
}
```

- [ ] **Step 4: Escrever o teste do `TokenUsageService` (failing)**

Crie `src/modules/token-usage/token-usage.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TokenUsageRecord } from './entities/token-usage-record.entity';
import { TokenUsageService } from './token-usage.service';
import { RecordTokenUsageDto } from './dto/record-token-usage.dto';

describe('TokenUsageService', () => {
  let service: TokenUsageService;
  let repo: { create: jest.Mock; save: jest.Mock; query: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn().mockResolvedValue({}),
      query: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        TokenUsageService,
        { provide: getRepositoryToken(TokenUsageRecord), useValue: repo },
      ],
    }).compile();

    service = module.get(TokenUsageService);
  });

  describe('record', () => {
    it('cria e salva um TokenUsageRecord no repositório', async () => {
      const dto: RecordTokenUsageDto = {
        endpoint: 'analyze/medicines',
        provider: 'gemini',
        model: 'gemini-1.5-flash',
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      };

      await service.record(dto);

      expect(repo.create).toHaveBeenCalledWith(dto);
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('aggregate', () => {
    it('retorna estrutura com totals, byEndpoint e byDay', async () => {
      const totalsRow = {
        requestCount: 2,
        inputTokens: 20,
        outputTokens: 10,
        totalTokens: 30,
      };
      const endpointRow = {
        endpoint: 'analyze/medicines',
        requestCount: 2,
        inputTokens: 20,
        outputTokens: 10,
        totalTokens: 30,
      };
      const dayRow = {
        date: '2026-07-28',
        requestCount: 2,
        inputTokens: 20,
        outputTokens: 10,
        totalTokens: 30,
      };

      repo.query
        .mockResolvedValueOnce([totalsRow])
        .mockResolvedValueOnce([endpointRow])
        .mockResolvedValueOnce([dayRow]);

      const result = await service.aggregate({
        from: '2026-07-01',
        to: '2026-07-28',
      });

      expect(result.from).toBe('2026-07-01');
      expect(result.to).toBe('2026-07-28');
      expect(result.totals).toEqual(totalsRow);
      expect(result.byEndpoint).toEqual([endpointRow]);
      expect(result.byDay).toEqual([dayRow]);
    });

    it('filtra por endpoint quando fornecido', async () => {
      repo.query.mockResolvedValue([]);

      await service.aggregate({ endpoint: 'analyze/vaccines' });

      // Verifica que o SQL inclui a condição de endpoint
      expect(repo.query).toHaveBeenCalledWith(
        expect.stringContaining('AND endpoint = $3'),
        expect.arrayContaining(['analyze/vaccines']),
      );
    });

    it('retorna totals zerados quando não há registros', async () => {
      repo.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.aggregate({});

      expect(result.totals).toEqual({
        requestCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      });
    });
  });
});
```

- [ ] **Step 5: Rodar o teste para confirmar que falha**

```bash
npm test -- --testPathPattern=token-usage.service
```

Esperado: FAIL — `TokenUsageService` não existe ainda.

- [ ] **Step 6: Implementar `TokenUsageService`**

Crie `src/modules/token-usage/token-usage.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecordTokenUsageDto } from './dto/record-token-usage.dto';
import { TokenUsageQueryDto } from './dto/token-usage-query.dto';
import {
  TokenUsageResponseDto,
  TokenTotalsDto,
} from './dto/token-usage-response.dto';
import { TokenUsageRecord } from './entities/token-usage-record.entity';

@Injectable()
export class TokenUsageService {
  constructor(
    @InjectRepository(TokenUsageRecord)
    private readonly repo: Repository<TokenUsageRecord>,
  ) {}

  async record(dto: RecordTokenUsageDto): Promise<void> {
    await this.repo.save(this.repo.create(dto));
  }

  async aggregate(query: TokenUsageQueryDto): Promise<TokenUsageResponseDto> {
    const fromDisplay = query.from ?? this.daysAgo(30);
    const toDisplay = query.to ?? this.today();

    const from = new Date(fromDisplay);
    const toExclusive = new Date(toDisplay);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

    const endpointCondition = query.endpoint ? 'AND endpoint = $3' : '';
    const params: (Date | string)[] = [from, toExclusive];
    if (query.endpoint) params.push(query.endpoint);

    const [totalsResult, byEndpointResult, byDayResult] = await Promise.all([
      this.repo.query<TokenTotalsDto[]>(
        `SELECT COUNT(*)::int AS "requestCount",
                COALESCE(SUM(input_tokens), 0)::int AS "inputTokens",
                COALESCE(SUM(output_tokens), 0)::int AS "outputTokens",
                COALESCE(SUM(total_tokens), 0)::int AS "totalTokens"
         FROM token_usage
         WHERE created_at >= $1 AND created_at < $2 ${endpointCondition}`,
        params,
      ),
      this.repo.query(
        `SELECT endpoint,
                COUNT(*)::int AS "requestCount",
                COALESCE(SUM(input_tokens), 0)::int AS "inputTokens",
                COALESCE(SUM(output_tokens), 0)::int AS "outputTokens",
                COALESCE(SUM(total_tokens), 0)::int AS "totalTokens"
         FROM token_usage
         WHERE created_at >= $1 AND created_at < $2 ${endpointCondition}
         GROUP BY endpoint`,
        params,
      ),
      this.repo.query(
        `SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS date,
                COUNT(*)::int AS "requestCount",
                COALESCE(SUM(input_tokens), 0)::int AS "inputTokens",
                COALESCE(SUM(output_tokens), 0)::int AS "outputTokens",
                COALESCE(SUM(total_tokens), 0)::int AS "totalTokens"
         FROM token_usage
         WHERE created_at >= $1 AND created_at < $2 ${endpointCondition}
         GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
         ORDER BY date`,
        params,
      ),
    ]);

    const zero: TokenTotalsDto = {
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };

    return {
      from: fromDisplay,
      to: toDisplay,
      totals: totalsResult[0] ?? zero,
      byEndpoint: byEndpointResult,
      byDay: byDayResult,
    };
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private daysAgo(n: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }
}
```

- [ ] **Step 7: Rodar os testes para confirmar que passam**

```bash
npm test -- --testPathPattern=token-usage.service
```

Esperado: 4 testes PASS.

- [ ] **Step 8: Criar `TokenUsageModule`**

Crie `src/modules/token-usage/token-usage.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenUsageRecord } from './entities/token-usage-record.entity';
import { TokenUsageService } from './token-usage.service';

@Module({
  imports: [TypeOrmModule.forFeature([TokenUsageRecord])],
  providers: [TokenUsageService],
  exports: [TokenUsageService],
})
export class TokenUsageModule {}
```

O controller será adicionado na Task 3.

- [ ] **Step 9: Build e lint**

```bash
npm run build && npm run lint
```

Esperado: sem erros.

- [ ] **Step 10: Commit**

```bash
git add src/modules/token-usage/ src/database/migrations/1785196800000-CreateTokenUsageTable.ts
git commit -m "feat: add TokenUsageModule with entity, migration, service and DTOs"
```

---

### Task 3: Controller, AnalyzeService wiring e E2E tests

Adiciona `TokenUsageController`, conecta `AnalyzeService` ao `TokenUsageService` (fire-and-forget), importa `TokenUsageModule` em `AnalyzeModule` e escreve testes E2E para o novo endpoint.

**Files:**
- Create: `src/modules/token-usage/token-usage.controller.ts`
- Modify: `src/modules/token-usage/token-usage.module.ts` (adicionar controller e ApiKeyGuard)
- Modify: `src/modules/analyze/analyze.service.ts` (injetar `TokenUsageService`, chamar `record()`)
- Modify: `src/modules/analyze/analyze.module.ts` (importar `TokenUsageModule`)
- Modify: `src/modules/analyze/analyze.service.spec.ts` (mock `TokenUsageService`, novos asserts)
- Create: `test/token-usage.e2e-spec.ts`

**Interfaces:**
- Consumes: `TokenUsageService.record(dto)` e `TokenUsageService.aggregate(query)` da Task 2
- Consumes: `TokenUsage` de `ai-provider.port.ts` (Task 1)

- [ ] **Step 1: Escrever o teste do controller E2E (failing)**

**Importante:** use providers individuais em vez de `TokenUsageModule` — importar o módulo traz `TypeOrmModule.forFeature` que exige uma conexão real com o banco. Registre controller, service mockado e guard diretamente no `createTestingModule`.

Crie `test/token-usage.e2e-spec.ts`:

```typescript
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
```

- [ ] **Step 2: Rodar o teste E2E para confirmar que falha**

```bash
npm run test:e2e -- --testPathPattern=token-usage
```

Esperado: FAIL — controller não existe.

- [ ] **Step 3: Criar `TokenUsageController`**

Crie `src/modules/token-usage/token-usage.controller.ts`:

```typescript
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { TokenUsageQueryDto } from './dto/token-usage-query.dto';
import { TokenUsageResponseDto } from './dto/token-usage-response.dto';
import { TokenUsageService } from './token-usage.service';

@Controller('token-usage')
@UseGuards(ApiKeyGuard)
export class TokenUsageController {
  constructor(private readonly tokenUsageService: TokenUsageService) {}

  @Get()
  aggregate(
    @Query() query: TokenUsageQueryDto,
  ): Promise<TokenUsageResponseDto> {
    return this.tokenUsageService.aggregate(query);
  }
}
```

- [ ] **Step 4: Atualizar `TokenUsageModule` para incluir controller e `ApiKeyGuard`**

Substitua o conteúdo de `src/modules/token-usage/token-usage.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { TokenUsageRecord } from './entities/token-usage-record.entity';
import { TokenUsageController } from './token-usage.controller';
import { TokenUsageService } from './token-usage.service';

@Module({
  imports: [TypeOrmModule.forFeature([TokenUsageRecord])],
  controllers: [TokenUsageController],
  providers: [TokenUsageService, ApiKeyGuard],
  exports: [TokenUsageService],
})
export class TokenUsageModule {}
```

- [ ] **Step 5: Rodar o teste E2E para confirmar que passa**

```bash
npm run test:e2e -- --testPathPattern=token-usage
```

Esperado: 4 testes PASS.

- [ ] **Step 6: Substituir `analyze.service.spec.ts` com a versão final completa**

Substitua todo o conteúdo de `src/modules/analyze/analyze.service.spec.ts`:

```typescript
import {
  BadRequestException,
  HttpStatus,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MedicinesContext } from './contexts/medicines.context';
import { VaccinesContext } from './contexts/vaccines.context';
import { AnalyzeService } from './analyze.service';
import { AudioProcessor } from './processors/audio.processor';
import { ImageProcessor } from './processors/image.processor';
import { PdfProcessor } from './processors/pdf.processor';
import { TokenUsageService } from '../token-usage/token-usage.service';

describe('AnalyzeService', () => {
  let service: AnalyzeService;
  let audioProcessor: { extract: jest.Mock };
  let imageProcessor: { extract: jest.Mock };
  let pdfProcessor: { extract: jest.Mock };
  let tokenUsageService: { record: jest.Mock };

  const buildFile = (
    overrides: Partial<Express.Multer.File> = {},
  ): Express.Multer.File =>
    ({
      fieldname: 'file',
      originalname: 'test.jpg',
      mimetype: 'image/jpeg',
      size: 1024,
      buffer: Buffer.from('data'),
      ...overrides,
    }) as Express.Multer.File;

  const wrapResult = <T>(data: T) => ({
    data,
    tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  });

  beforeEach(async () => {
    audioProcessor = { extract: jest.fn() };
    imageProcessor = { extract: jest.fn() };
    pdfProcessor = { extract: jest.fn() };
    tokenUsageService = { record: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        AnalyzeService,
        { provide: AudioProcessor, useValue: audioProcessor },
        { provide: ImageProcessor, useValue: imageProcessor },
        { provide: PdfProcessor, useValue: pdfProcessor },
        { provide: TokenUsageService, useValue: tokenUsageService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: unknown) => {
              const map: Record<string, unknown> = {
                AUDIO_MAX_SIZE_MB: 25,
                IMAGE_MAX_SIZE_MB: 10,
                PDF_MAX_SIZE_MB: 20,
                GEMINI_MODEL: 'gemini-1.5-flash',
              };
              return map[key] ?? def;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(AnalyzeService);
  });

  describe('analyzeMedicines', () => {
    it('roteia image/jpeg para ImageProcessor com MedicinesContext', async () => {
      const file = buildFile({ mimetype: 'image/jpeg' });
      const expected = {
        medicines: [{ name: 'Amoxicilina', dosage: '500mg', frequency: '8h' }],
      };
      imageProcessor.extract.mockResolvedValue(wrapResult(expected));

      const result = await service.analyzeMedicines(file);

      expect(imageProcessor.extract).toHaveBeenCalledWith(
        file,
        MedicinesContext,
      );
      expect(result).toEqual(expected);
    });

    it('roteia audio/mpeg para AudioProcessor', async () => {
      const file = buildFile({ mimetype: 'audio/mpeg' });
      audioProcessor.extract.mockResolvedValue(wrapResult({ medicines: [] }));

      await service.analyzeMedicines(file);

      expect(audioProcessor.extract).toHaveBeenCalledWith(
        file,
        MedicinesContext,
      );
    });

    it('roteia application/pdf para PdfProcessor', async () => {
      const file = buildFile({ mimetype: 'application/pdf' });
      pdfProcessor.extract.mockResolvedValue(wrapResult({ medicines: [] }));

      await service.analyzeMedicines(file);

      expect(pdfProcessor.extract).toHaveBeenCalledWith(file, MedicinesContext);
    });

    it('lança BadRequestException quando file é undefined', async () => {
      await expect(
        service.analyzeMedicines(undefined as unknown as Express.Multer.File),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lança UnprocessableEntityException para MIME type não suportado', async () => {
      const file = buildFile({ mimetype: 'text/plain' });

      await expect(service.analyzeMedicines(file)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('lança HttpException 413 quando arquivo excede o limite configurado', async () => {
      const file = buildFile({
        mimetype: 'image/jpeg',
        size: 11 * 1024 * 1024,
      });

      await expect(service.analyzeMedicines(file)).rejects.toMatchObject({
        status: HttpStatus.PAYLOAD_TOO_LARGE,
      });
    });

    it('chama tokenUsageService.record() com endpoint, provider, model e tokenUsage corretos', async () => {
      const file = buildFile({ mimetype: 'image/jpeg' });
      const tokenUsage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
      imageProcessor.extract.mockResolvedValue({ data: { medicines: [] }, tokenUsage });

      await service.analyzeMedicines(file);
      await Promise.resolve(); // flush microtask queue

      expect(tokenUsageService.record).toHaveBeenCalledWith({
        endpoint: 'analyze/medicines',
        provider: 'gemini',
        model: 'gemini-1.5-flash',
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      });
    });

    it('não propaga erro do tokenUsageService.record() para o cliente', async () => {
      const file = buildFile({ mimetype: 'image/jpeg' });
      imageProcessor.extract.mockResolvedValue(wrapResult({ medicines: [] }));
      tokenUsageService.record.mockRejectedValue(new Error('DB down'));

      await expect(service.analyzeMedicines(file)).resolves.toEqual({
        medicines: [],
      });
    });
  });

  describe('analyzeVaccines', () => {
    it('roteia image/png para ImageProcessor com VaccinesContext', async () => {
      const file = buildFile({ mimetype: 'image/png' });
      const expected = {
        vaccines: [{ name: 'BCG', date: '2020-01-01', dose: 'única' }],
      };
      imageProcessor.extract.mockResolvedValue(wrapResult(expected));

      const result = await service.analyzeVaccines(file);

      expect(imageProcessor.extract).toHaveBeenCalledWith(
        file,
        VaccinesContext,
      );
      expect(result).toEqual(expected);
    });
  });
});
```

- [ ] **Step 7: Rodar os testes para confirmar que falham (AnalyzeService não tem TokenUsageService ainda)**

```bash
npm test -- --testPathPattern=analyze.service
```

Esperado: FAIL — `TokenUsageService` não está injetado.

- [ ] **Step 8: Atualizar `AnalyzeService` para injetar `TokenUsageService` e chamar `record()`**

Substitua o conteúdo de `src/modules/analyze/analyze.service.ts`:

```typescript
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MedicinesContext } from './contexts/medicines.context';
import { VaccinesContext } from './contexts/vaccines.context';
import { MedicinesAnalysisDto } from './dto/medicines-analysis.dto';
import { VaccinesAnalysisDto } from './dto/vaccines-analysis.dto';
import { IAnalyzeService } from './interfaces/analyze-service.interface';
import { IProcessor } from './interfaces/processor.interface';
import { AudioProcessor } from './processors/audio.processor';
import { ImageProcessor } from './processors/image.processor';
import { PdfProcessor } from './processors/pdf.processor';
import { TokenUsageService } from '../token-usage/token-usage.service';

type MediaType = 'audio' | 'image' | 'pdf';

const MIME_TYPE_MAP: Record<string, MediaType> = {
  'audio/mpeg': 'audio',
  'audio/wav': 'audio',
  'audio/mp4': 'audio',
  'audio/ogg': 'audio',
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'application/pdf': 'pdf',
};

const MAX_SIZE_ENV_KEY: Record<MediaType, string> = {
  audio: 'AUDIO_MAX_SIZE_MB',
  image: 'IMAGE_MAX_SIZE_MB',
  pdf: 'PDF_MAX_SIZE_MB',
};

const DEFAULT_MAX_MB: Record<MediaType, number> = {
  audio: 25,
  image: 10,
  pdf: 20,
};

@Injectable()
export class AnalyzeService implements IAnalyzeService {
  private readonly logger = new Logger(AnalyzeService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly audioProcessor: AudioProcessor,
    private readonly imageProcessor: ImageProcessor,
    private readonly pdfProcessor: PdfProcessor,
    private readonly tokenUsageService: TokenUsageService,
  ) {}

  private resolveProcessor(mimeType: string): IProcessor {
    const type = MIME_TYPE_MAP[mimeType];
    if (!type) {
      throw new UnprocessableEntityException(
        `Unsupported file type: ${mimeType}`,
      );
    }
    const map: Record<MediaType, IProcessor> = {
      audio: this.audioProcessor,
      image: this.imageProcessor,
      pdf: this.pdfProcessor,
    };
    return map[type];
  }

  private validateFile(file: Express.Multer.File): void {
    if (!file) throw new BadRequestException('File is required');

    const type = MIME_TYPE_MAP[file.mimetype];
    if (!type) {
      throw new UnprocessableEntityException(
        `Unsupported file type: ${file.mimetype}`,
      );
    }

    const maxMB = this.config.get<number>(
      MAX_SIZE_ENV_KEY[type],
      DEFAULT_MAX_MB[type],
    );
    if (file.size > maxMB * 1024 * 1024) {
      throw new HttpException(
        `File too large. Max: ${maxMB}MB`,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
  }

  private recordUsage(endpoint: string, tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number }): void {
    this.tokenUsageService
      .record({
        endpoint,
        provider: 'gemini',
        model: this.config.get<string>('GEMINI_MODEL', 'gemini-1.5-flash'),
        ...tokenUsage,
      })
      .catch((err) => this.logger.error('Failed to record token usage', err));
  }

  async analyzeMedicines(
    file: Express.Multer.File,
  ): Promise<MedicinesAnalysisDto> {
    this.validateFile(file);
    const processor = this.resolveProcessor(file.mimetype);
    this.logger.log(`Analyzing medicines — mimeType: ${file.mimetype}`);
    const { data, tokenUsage } = await processor.extract<MedicinesAnalysisDto>(
      file,
      MedicinesContext,
    );
    this.recordUsage('analyze/medicines', tokenUsage);
    return data;
  }

  async analyzeVaccines(
    file: Express.Multer.File,
  ): Promise<VaccinesAnalysisDto> {
    this.validateFile(file);
    const processor = this.resolveProcessor(file.mimetype);
    this.logger.log(`Analyzing vaccines — mimeType: ${file.mimetype}`);
    const { data, tokenUsage } = await processor.extract<VaccinesAnalysisDto>(
      file,
      VaccinesContext,
    );
    this.recordUsage('analyze/vaccines', tokenUsage);
    return data;
  }
}
```

- [ ] **Step 9: Atualizar `AnalyzeModule` para importar `TokenUsageModule`**

Substitua o conteúdo de `src/modules/analyze/analyze.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AiModule } from '../../ai/ai.module';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { TokenUsageModule } from '../token-usage/token-usage.module';
import { AnalyzeController } from './analyze.controller';
import { AnalyzeService } from './analyze.service';
import { ANALYZE_SERVICE } from './interfaces/analyze-service.interface';
import { AudioProcessor } from './processors/audio.processor';
import { ImageProcessor } from './processors/image.processor';
import { PdfProcessor } from './processors/pdf.processor';

@Module({
  imports: [AiModule, TokenUsageModule],
  controllers: [AnalyzeController],
  providers: [
    { provide: ANALYZE_SERVICE, useClass: AnalyzeService },
    AudioProcessor,
    ImageProcessor,
    PdfProcessor,
    ApiKeyGuard,
  ],
})
export class AnalyzeModule {}
```

- [ ] **Step 10: Rodar todos os testes**

```bash
npm run build && npm run test
```

Esperado: build verde, todos os testes passando (unit + os novos specs de AnalyzeService).

- [ ] **Step 11: Rodar os testes E2E de token-usage**

```bash
npm run test:e2e -- --testPathPattern=token-usage
```

Esperado: 4 testes PASS.

- [ ] **Step 12: Atualizar `test/analyze.e2e-spec.ts` para mockar `TokenUsageService` e verificar E2E**

`AnalyzeModule` agora importa `TokenUsageModule`, que traz `TypeOrmModule.forFeature([TokenUsageRecord])`. Sem um banco real, o E2E falharia. A solução é fazer override do `TokenUsageService` no test module.

Adicione em `test/analyze.e2e-spec.ts`, logo após `import { AnalyzeModule }`:

```typescript
import { TokenUsageService } from '../src/modules/token-usage/token-usage.service';
```

No `Test.createTestingModule(...).overrideProvider(AI_PROVIDER).useValue(mockAiProvider).overrideProvider(ConfigService).useValue(mockConfigService)`, adicione mais um override:

```typescript
.overrideProvider(TokenUsageService)
.useValue({ record: jest.fn().mockResolvedValue(undefined) })
```

O bloco `.overrideProvider(...).compile()` final fica:

```typescript
const moduleRef = await Test.createTestingModule({
  imports: [
    ConfigModule.forRoot({ ignoreEnvFile: true, ignoreEnvVars: true, isGlobal: true }),
    AnalyzeModule,
  ],
})
  .overrideProvider(AI_PROVIDER)
  .useValue(mockAiProvider)
  .overrideProvider(ConfigService)
  .useValue(mockConfigService)
  .overrideProvider(TokenUsageService)
  .useValue({ record: jest.fn().mockResolvedValue(undefined) })
  .compile();
```

Depois rode:

```bash
npm run test:e2e -- --testPathPattern=analyze
```

Esperado: 7 testes PASS.

- [ ] **Step 13: Commit**

```bash
git add src/modules/token-usage/token-usage.controller.ts \
        src/modules/token-usage/token-usage.module.ts \
        src/modules/analyze/analyze.service.ts \
        src/modules/analyze/analyze.module.ts \
        src/modules/analyze/analyze.service.spec.ts \
        test/token-usage.e2e-spec.ts
git commit -m "feat: wire token usage recording in AnalyzeService and expose GET /token-usage"
```
