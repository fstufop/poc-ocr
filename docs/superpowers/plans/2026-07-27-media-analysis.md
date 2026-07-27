# Media Analysis API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a NestJS API that receives audio, image, or PDF files via multipart/form-data and returns structured JSON by analyzing content with Gemini AI — organized by what to extract (`/analyze/medicines`, `/analyze/vaccines`), not by file type.

**Architecture:** Provider-agnostic `AIProviderPort` interface with `GeminiAdapter` implementation; Strategy Pattern — `AnalyzeService` resolves `AudioProcessor | ImageProcessor | PdfProcessor` by MIME type and delegates with a typed `AnalysisContext` (prompt + response schema); endpoint = business domain concept; `ApiKeyGuard` validates `X-Api-Key` header.

**Tech Stack:** NestJS 11, Node 22, TypeScript/CommonJS, `@google/genai`, multer (via `@nestjs/platform-express`), `class-validator`, Jest

## Global Constraints

- NestJS 11, Node 22, TypeScript, CommonJS — no ESM
- Every service implements an `I[Name]Service` interface and is registered under a `Symbol` token (CLAUDE.md convention #2)
- Constructor injection only — never `new` a dependency
- Logging via `new Logger(ClassName.name)` only — no `console.log`
- All config via `ConfigService.get<T>()` — no hardcoded secrets or URLs
- Every new env var added to both `src/config/env.validation.ts` and `.env.example`
- `synchronize: false` — no schema changes in this feature (no new entities)
- `npm run build && npm run lint && npm run test` must pass before each commit

---

### Task 1: Install dependencies + extend env validation

**Files:**
- Modify: `package.json` (via npm install — no manual edit)
- Modify: `src/config/env.validation.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `EnvironmentVariables.API_KEY`, `.GEMINI_API_KEY`, `.GEMINI_MODEL`, `.AUDIO_MAX_SIZE_MB`, `.IMAGE_MAX_SIZE_MB`, `.PDF_MAX_SIZE_MB`, `.AI_TIMEOUT_MS`

- [ ] **Step 1: Install packages**

```bash
npm install @google/genai
npm install --save-dev @types/multer
```

- [ ] **Step 2: Add env vars to `src/config/env.validation.ts`**

Append to the `EnvironmentVariables` class, after the Redis block:

```typescript
// ---- Autenticação ----
@IsString()
API_KEY: string;

// ---- Gemini ----
@IsString()
GEMINI_API_KEY: string;

@IsString()
@IsOptional()
GEMINI_MODEL: string = 'gemini-1.5-flash';

// ---- Limites de arquivo ----
@IsInt()
@Min(1)
@IsOptional()
AUDIO_MAX_SIZE_MB: number = 25;

@IsInt()
@Min(1)
@IsOptional()
IMAGE_MAX_SIZE_MB: number = 10;

@IsInt()
@Min(1)
@IsOptional()
PDF_MAX_SIZE_MB: number = 20;

// ---- IA ----
@IsInt()
@Min(1000)
@IsOptional()
AI_TIMEOUT_MS: number = 30000;
```

Make sure `IsInt` and `Min` are already imported (they are). Add to existing imports if needed.

- [ ] **Step 3: Append to `.env.example`**

```dotenv
# =========================================
# Autenticação
# =========================================
API_KEY=change-me

# =========================================
# Gemini / IA
# =========================================
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash
AI_TIMEOUT_MS=30000

# =========================================
# Limites de arquivo (MB)
# =========================================
AUDIO_MAX_SIZE_MB=25
IMAGE_MAX_SIZE_MB=10
PDF_MAX_SIZE_MB=20
```

- [ ] **Step 4: Build check**

```bash
npm run build
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/config/env.validation.ts .env.example package.json package-lock.json
git commit -m "feat: install @google/genai and extend env validation for media analysis"
```

---

### Task 2: AI Provider Port + Gemini Adapter + AiModule

**Files:**
- Create: `src/ai/ai-provider.port.ts`
- Create: `src/ai/adapters/gemini.adapter.ts`
- Create: `src/ai/adapters/gemini.adapter.spec.ts`
- Create: `src/ai/ai.module.ts`

**Interfaces:**
- Produces:
  - `AI_PROVIDER: symbol`
  - `AIAnalysisInput { fileBuffer: Buffer; mimeType: string; prompt: string; responseSchema: object }`
  - `AIProviderPort { analyze<T>(input: AIAnalysisInput): Promise<T> }`
  - `GeminiAdapter implements AIProviderPort`
  - `AiModule` — exports `AI_PROVIDER`

- [ ] **Step 1: Create the port interface**

Create `src/ai/ai-provider.port.ts`:

```typescript
export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface AIAnalysisInput {
  fileBuffer: Buffer;
  mimeType: string;
  prompt: string;
  responseSchema: object;
}

export interface AIProviderPort {
  analyze<T>(input: AIAnalysisInput): Promise<T>;
}
```

- [ ] **Step 2: Write the failing tests for GeminiAdapter**

Create `src/ai/adapters/gemini.adapter.spec.ts`:

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
    responseSchema: { type: 'object', properties: { result: { type: 'string' } } },
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
                AI_TIMEOUT_MS: 50, // short timeout for test
              };
              return map[key] ?? def;
            }),
          },
        },
      ],
    }).compile();

    adapter = module.get(GeminiAdapter);
  });

  it('retorna o JSON parseado da resposta do Gemini', async () => {
    mockGenerateContent.mockResolvedValue({ text: '{"result":"ok"}' });

    const result = await adapter.analyze<{ result: string }>(buildInput());

    expect(result).toEqual({ result: 'ok' });
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-1.5-flash' }),
    );
  });

  it('lança BadGatewayException quando a resposta está vazia', async () => {
    mockGenerateContent.mockResolvedValue({ text: '' });

    await expect(adapter.analyze(buildInput())).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('lança GatewayTimeoutException quando excede AI_TIMEOUT_MS', async () => {
    mockGenerateContent.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ text: '{}' }), 200)),
    );

    await expect(adapter.analyze(buildInput())).rejects.toBeInstanceOf(GatewayTimeoutException);
  }, 5000);
});
```

- [ ] **Step 3: Run to confirm failure**

```bash
npm test -- --testPathPattern=gemini.adapter.spec
```

Expected: FAIL — `GeminiAdapter` not found.

- [ ] **Step 4: Implement GeminiAdapter**

Create `src/ai/adapters/gemini.adapter.ts`:

```typescript
import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { AIAnalysisInput, AIProviderPort } from '../ai-provider.port';

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

  async analyze<T>(input: AIAnalysisInput): Promise<T> {
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
      throw new BadGatewayException('AI provider returned an unexpected response');
    }

    this.logger.debug(`Gemini raw response: ${response.text.slice(0, 120)}`);
    return JSON.parse(response.text) as T;
  }
}
```

- [ ] **Step 5: Create AiModule**

Create `src/ai/ai.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { GeminiAdapter } from './adapters/gemini.adapter';
import { AI_PROVIDER } from './ai-provider.port';

@Module({
  providers: [{ provide: AI_PROVIDER, useClass: GeminiAdapter }],
  exports: [AI_PROVIDER],
})
export class AiModule {}
```

- [ ] **Step 6: Run tests**

```bash
npm test -- --testPathPattern=gemini.adapter.spec
```

Expected: PASS — 3 tests pass.

- [ ] **Step 7: Build check**

```bash
npm run build
```

Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/ai/
git commit -m "feat: add AIProviderPort, GeminiAdapter with structured output, and AiModule"
```

---

### Task 3: ApiKeyGuard

**Files:**
- Create: `src/common/guards/api-key.guard.ts`
- Create: `src/common/guards/api-key.guard.spec.ts`

**Interfaces:**
- Produces: `ApiKeyGuard implements CanActivate`
  - Missing `X-Api-Key` → throws `UnauthorizedException` (401)
  - Wrong key → throws `ForbiddenException` (403)
  - Correct key → returns `true`

- [ ] **Step 1: Write the failing test**

Create `src/common/guards/api-key.guard.spec.ts`:

```typescript
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;

  const buildContext = (headers: Record<string, string> = {}): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ApiKeyGuard,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('secret-key') },
        },
      ],
    }).compile();

    guard = module.get(ApiKeyGuard);
  });

  it('lança UnauthorizedException quando o header X-Api-Key está ausente', () => {
    expect(() => guard.canActivate(buildContext())).toThrow(UnauthorizedException);
  });

  it('lança ForbiddenException quando a chave é inválida', () => {
    expect(() =>
      guard.canActivate(buildContext({ 'x-api-key': 'wrong-key' })),
    ).toThrow(ForbiddenException);
  });

  it('retorna true quando a chave é válida', () => {
    expect(guard.canActivate(buildContext({ 'x-api-key': 'secret-key' }))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- --testPathPattern=api-key.guard.spec
```

Expected: FAIL — `ApiKeyGuard` not found.

- [ ] **Step 3: Implement ApiKeyGuard**

Create `src/common/guards/api-key.guard.ts`:

```typescript
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = request.headers['x-api-key'];

    if (!key) throw new UnauthorizedException();
    if (key !== this.config.get<string>('API_KEY')) throw new ForbiddenException();

    return true;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --testPathPattern=api-key.guard.spec
```

Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/common/guards/
git commit -m "feat: add ApiKeyGuard for X-Api-Key header auth"
```

---

### Task 4: Processor interface + AudioProcessor + ImageProcessor + PdfProcessor

**Files:**
- Create: `src/modules/analyze/interfaces/processor.interface.ts`
- Create: `src/modules/analyze/processors/audio.processor.ts`
- Create: `src/modules/analyze/processors/audio.processor.spec.ts`
- Create: `src/modules/analyze/processors/image.processor.ts`
- Create: `src/modules/analyze/processors/image.processor.spec.ts`
- Create: `src/modules/analyze/processors/pdf.processor.ts`
- Create: `src/modules/analyze/processors/pdf.processor.spec.ts`

**Interfaces:**
- Consumes: `AI_PROVIDER: symbol`, `AIProviderPort`, `AIAnalysisInput` from Task 2
- Produces:
  - `AnalysisContext { prompt: string; responseSchema: object }`
  - `IProcessor { extract<T>(file: Express.Multer.File, context: AnalysisContext): Promise<T> }`
  - `AudioProcessor implements IProcessor`
  - `ImageProcessor implements IProcessor`
  - `PdfProcessor implements IProcessor`

- [ ] **Step 1: Create processor interface**

Create `src/modules/analyze/interfaces/processor.interface.ts`:

```typescript
export interface AnalysisContext {
  prompt: string;
  responseSchema: object;
}

export interface IProcessor {
  extract<T>(file: Express.Multer.File, context: AnalysisContext): Promise<T>;
}
```

- [ ] **Step 2: Write failing tests for AudioProcessor**

Create `src/modules/analyze/processors/audio.processor.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { AI_PROVIDER } from '../../../ai/ai-provider.port';
import { AudioProcessor } from './audio.processor';

describe('AudioProcessor', () => {
  let processor: AudioProcessor;
  let aiProvider: { analyze: jest.Mock };

  const buildFile = (): Express.Multer.File =>
    ({ buffer: Buffer.from('audio-data'), mimetype: 'audio/mpeg' }) as Express.Multer.File;

  const buildContext = () => ({
    prompt: 'Extract medicines from audio',
    responseSchema: { type: 'object' },
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
    aiProvider.analyze.mockResolvedValue({ medicines: [] });

    await processor.extract(file, context);

    expect(aiProvider.analyze).toHaveBeenCalledWith({
      fileBuffer: file.buffer,
      mimeType: file.mimetype,
      prompt: context.prompt,
      responseSchema: context.responseSchema,
    });
  });

  it('retorna o resultado do AIProviderPort', async () => {
    const expected = { medicines: [{ name: 'Amoxicilina' }] };
    aiProvider.analyze.mockResolvedValue(expected);

    const result = await processor.extract(buildFile(), buildContext());

    expect(result).toEqual(expected);
  });
});
```

- [ ] **Step 3: Write failing tests for ImageProcessor**

Create `src/modules/analyze/processors/image.processor.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { AI_PROVIDER } from '../../../ai/ai-provider.port';
import { ImageProcessor } from './image.processor';

describe('ImageProcessor', () => {
  let processor: ImageProcessor;
  let aiProvider: { analyze: jest.Mock };

  const buildFile = (): Express.Multer.File =>
    ({ buffer: Buffer.from('image-data'), mimetype: 'image/jpeg' }) as Express.Multer.File;

  const buildContext = () => ({
    prompt: 'Extract data from image',
    responseSchema: { type: 'object' },
  });

  beforeEach(async () => {
    aiProvider = { analyze: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ImageProcessor,
        { provide: AI_PROVIDER, useValue: aiProvider },
      ],
    }).compile();

    processor = module.get(ImageProcessor);
  });

  it('chama AIProviderPort com fileBuffer, mimeType, prompt e responseSchema corretos', async () => {
    const file = buildFile();
    const context = buildContext();
    aiProvider.analyze.mockResolvedValue({ vaccines: [] });

    await processor.extract(file, context);

    expect(aiProvider.analyze).toHaveBeenCalledWith({
      fileBuffer: file.buffer,
      mimeType: file.mimetype,
      prompt: context.prompt,
      responseSchema: context.responseSchema,
    });
  });

  it('retorna o resultado do AIProviderPort', async () => {
    const expected = { vaccines: [{ name: 'BCG' }] };
    aiProvider.analyze.mockResolvedValue(expected);

    const result = await processor.extract(buildFile(), buildContext());

    expect(result).toEqual(expected);
  });
});
```

- [ ] **Step 4: Write failing tests for PdfProcessor**

Create `src/modules/analyze/processors/pdf.processor.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { AI_PROVIDER } from '../../../ai/ai-provider.port';
import { PdfProcessor } from './pdf.processor';

describe('PdfProcessor', () => {
  let processor: PdfProcessor;
  let aiProvider: { analyze: jest.Mock };

  const buildFile = (): Express.Multer.File =>
    ({ buffer: Buffer.from('pdf-data'), mimetype: 'application/pdf' }) as Express.Multer.File;

  const buildContext = () => ({
    prompt: 'Extract data from PDF',
    responseSchema: { type: 'object' },
  });

  beforeEach(async () => {
    aiProvider = { analyze: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        PdfProcessor,
        { provide: AI_PROVIDER, useValue: aiProvider },
      ],
    }).compile();

    processor = module.get(PdfProcessor);
  });

  it('chama AIProviderPort com fileBuffer, mimeType, prompt e responseSchema corretos', async () => {
    const file = buildFile();
    const context = buildContext();
    aiProvider.analyze.mockResolvedValue({ medicines: [] });

    await processor.extract(file, context);

    expect(aiProvider.analyze).toHaveBeenCalledWith({
      fileBuffer: file.buffer,
      mimeType: file.mimetype,
      prompt: context.prompt,
      responseSchema: context.responseSchema,
    });
  });

  it('retorna o resultado do AIProviderPort', async () => {
    const expected = { medicines: [{ name: 'Dipirona' }] };
    aiProvider.analyze.mockResolvedValue(expected);

    const result = await processor.extract(buildFile(), buildContext());

    expect(result).toEqual(expected);
  });
});
```

- [ ] **Step 5: Run to confirm failures**

```bash
npm test -- --testPathPattern="processors/"
```

Expected: FAIL — processor classes not found.

- [ ] **Step 6: Implement AudioProcessor**

Create `src/modules/analyze/processors/audio.processor.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { AI_PROVIDER, AIProviderPort } from '../../../ai/ai-provider.port';
import { AnalysisContext, IProcessor } from '../interfaces/processor.interface';

@Injectable()
export class AudioProcessor implements IProcessor {
  constructor(
    @Inject(AI_PROVIDER)
    private readonly aiProvider: AIProviderPort,
  ) {}

  extract<T>(file: Express.Multer.File, context: AnalysisContext): Promise<T> {
    return this.aiProvider.analyze<T>({
      fileBuffer: file.buffer,
      mimeType: file.mimetype,
      prompt: context.prompt,
      responseSchema: context.responseSchema,
    });
  }
}
```

- [ ] **Step 7: Implement ImageProcessor**

Create `src/modules/analyze/processors/image.processor.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { AI_PROVIDER, AIProviderPort } from '../../../ai/ai-provider.port';
import { AnalysisContext, IProcessor } from '../interfaces/processor.interface';

@Injectable()
export class ImageProcessor implements IProcessor {
  constructor(
    @Inject(AI_PROVIDER)
    private readonly aiProvider: AIProviderPort,
  ) {}

  extract<T>(file: Express.Multer.File, context: AnalysisContext): Promise<T> {
    return this.aiProvider.analyze<T>({
      fileBuffer: file.buffer,
      mimeType: file.mimetype,
      prompt: context.prompt,
      responseSchema: context.responseSchema,
    });
  }
}
```

- [ ] **Step 8: Implement PdfProcessor**

Create `src/modules/analyze/processors/pdf.processor.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { AI_PROVIDER, AIProviderPort } from '../../../ai/ai-provider.port';
import { AnalysisContext, IProcessor } from '../interfaces/processor.interface';

@Injectable()
export class PdfProcessor implements IProcessor {
  constructor(
    @Inject(AI_PROVIDER)
    private readonly aiProvider: AIProviderPort,
  ) {}

  extract<T>(file: Express.Multer.File, context: AnalysisContext): Promise<T> {
    return this.aiProvider.analyze<T>({
      fileBuffer: file.buffer,
      mimeType: file.mimetype,
      prompt: context.prompt,
      responseSchema: context.responseSchema,
    });
  }
}
```

- [ ] **Step 9: Run tests**

```bash
npm test -- --testPathPattern="processors/"
```

Expected: PASS — 6 tests pass (2 per processor).

- [ ] **Step 10: Commit**

```bash
git add src/modules/analyze/interfaces/processor.interface.ts src/modules/analyze/processors/
git commit -m "feat: add IProcessor interface and Audio/Image/Pdf processors"
```

---

### Task 5: Analysis contexts + response DTOs

**Files:**
- Create: `src/modules/analyze/contexts/medicines.context.ts`
- Create: `src/modules/analyze/contexts/vaccines.context.ts`
- Create: `src/modules/analyze/dto/medicines-analysis.dto.ts`
- Create: `src/modules/analyze/dto/vaccines-analysis.dto.ts`

**Interfaces:**
- Consumes: `AnalysisContext` from Task 4
- Produces:
  - `MedicinesContext: AnalysisContext` — prompt + JSON schema for medicines extraction
  - `VaccinesContext: AnalysisContext` — prompt + JSON schema for vaccines extraction
  - `MedicineItemDto { name: string; dosage?: string; frequency?: string }`
  - `MedicinesAnalysisDto { medicines: MedicineItemDto[] }`
  - `VaccineItemDto { name: string; date?: string; dose?: string }`
  - `VaccinesAnalysisDto { vaccines: VaccineItemDto[] }`

No test cycle needed — pure data definitions with no logic.

- [ ] **Step 1: Create medicines context**

Create `src/modules/analyze/contexts/medicines.context.ts`:

```typescript
import { AnalysisContext } from '../interfaces/processor.interface';

export const MedicinesContext: AnalysisContext = {
  prompt: `Analise o conteúdo fornecido (receita médica em imagem, PDF ou áudio de relato de paciente).
Extraia todos os medicamentos mencionados.
Para cada medicamento, identifique: nome (comercial ou genérico), dosagem e frequência de uso.
Omita campos que não estejam claramente indicados no conteúdo — não invente informações.
Retorne apenas os dados encontrados.`,
  responseSchema: {
    type: 'object',
    properties: {
      medicines: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nome do medicamento' },
            dosage: { type: 'string', description: 'Dosagem (ex: 500mg)' },
            frequency: { type: 'string', description: 'Frequência (ex: 8h, 1x ao dia)' },
          },
          required: ['name'],
        },
      },
    },
    required: ['medicines'],
  },
};
```

- [ ] **Step 2: Create vaccines context**

Create `src/modules/analyze/contexts/vaccines.context.ts`:

```typescript
import { AnalysisContext } from '../interfaces/processor.interface';

export const VaccinesContext: AnalysisContext = {
  prompt: `Analise o conteúdo fornecido (carteira de vacinação em imagem, PDF ou áudio de relato de paciente).
Extraia todas as vacinas mencionadas ou registradas.
Para cada vacina, identifique: nome, data de aplicação e número ou tipo da dose.
Omita campos que não estejam claramente indicados no conteúdo — não invente informações.
Retorne apenas os dados encontrados.`,
  responseSchema: {
    type: 'object',
    properties: {
      vaccines: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nome da vacina' },
            date: { type: 'string', description: 'Data de aplicação (ISO 8601 ou texto livre)' },
            dose: { type: 'string', description: 'Tipo ou número da dose (ex: única, 1ª dose)' },
          },
          required: ['name'],
        },
      },
    },
    required: ['vaccines'],
  },
};
```

- [ ] **Step 3: Create DTOs**

Create `src/modules/analyze/dto/medicines-analysis.dto.ts`:

```typescript
export class MedicineItemDto {
  name: string;
  dosage?: string;
  frequency?: string;
}

export class MedicinesAnalysisDto {
  medicines: MedicineItemDto[];
}
```

Create `src/modules/analyze/dto/vaccines-analysis.dto.ts`:

```typescript
export class VaccineItemDto {
  name: string;
  date?: string;
  dose?: string;
}

export class VaccinesAnalysisDto {
  vaccines: VaccineItemDto[];
}
```

- [ ] **Step 4: Build check**

```bash
npm run build
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/modules/analyze/contexts/ src/modules/analyze/dto/
git commit -m "feat: add medicines and vaccines contexts and response DTOs"
```

---

### Task 6: AnalyzeService

**Files:**
- Create: `src/modules/analyze/interfaces/analyze-service.interface.ts`
- Create: `src/modules/analyze/analyze.service.ts`
- Create: `src/modules/analyze/analyze.service.spec.ts`

**Interfaces:**
- Consumes:
  - `AudioProcessor`, `ImageProcessor`, `PdfProcessor` from Task 4
  - `MedicinesContext`, `VaccinesContext` from Task 5
  - `MedicinesAnalysisDto`, `VaccinesAnalysisDto` from Task 5
  - `ConfigService` from `@nestjs/config`
- Produces:
  - `ANALYZE_SERVICE: symbol`
  - `IAnalyzeService { analyzeMedicines(file: Express.Multer.File): Promise<MedicinesAnalysisDto>; analyzeVaccines(file: Express.Multer.File): Promise<VaccinesAnalysisDto> }`
  - `AnalyzeService implements IAnalyzeService`
  - Validation: throws `BadRequestException` (no file), `UnprocessableEntityException` (bad MIME), `HttpException(413)` (file too large)

- [ ] **Step 1: Create the service interface**

Create `src/modules/analyze/interfaces/analyze-service.interface.ts`:

```typescript
import { MedicinesAnalysisDto } from '../dto/medicines-analysis.dto';
import { VaccinesAnalysisDto } from '../dto/vaccines-analysis.dto';

export const ANALYZE_SERVICE = Symbol('ANALYZE_SERVICE');

export interface IAnalyzeService {
  analyzeMedicines(file: Express.Multer.File): Promise<MedicinesAnalysisDto>;
  analyzeVaccines(file: Express.Multer.File): Promise<VaccinesAnalysisDto>;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/modules/analyze/analyze.service.spec.ts`:

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

  const buildFile = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File =>
    ({
      fieldname: 'file',
      originalname: 'test.jpg',
      mimetype: 'image/jpeg',
      size: 1024,
      buffer: Buffer.from('data'),
      ...overrides,
    }) as Express.Multer.File;

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
            get: jest.fn((key: string, def: number) => {
              const map: Record<string, number> = {
                AUDIO_MAX_SIZE_MB: 25,
                IMAGE_MAX_SIZE_MB: 10,
                PDF_MAX_SIZE_MB: 20,
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
      const expected = { medicines: [{ name: 'Amoxicilina', dosage: '500mg', frequency: '8h' }] };
      imageProcessor.extract.mockResolvedValue(expected);

      const result = await service.analyzeMedicines(file);

      expect(imageProcessor.extract).toHaveBeenCalledWith(file, MedicinesContext);
      expect(result).toEqual(expected);
    });

    it('roteia audio/mpeg para AudioProcessor', async () => {
      const file = buildFile({ mimetype: 'audio/mpeg' });
      audioProcessor.extract.mockResolvedValue({ medicines: [] });

      await service.analyzeMedicines(file);

      expect(audioProcessor.extract).toHaveBeenCalledWith(file, MedicinesContext);
    });

    it('roteia application/pdf para PdfProcessor', async () => {
      const file = buildFile({ mimetype: 'application/pdf' });
      pdfProcessor.extract.mockResolvedValue({ medicines: [] });

      await service.analyzeMedicines(file);

      expect(pdfProcessor.extract).toHaveBeenCalledWith(file, MedicinesContext);
    });

    it('lança BadRequestException quando file é undefined', async () => {
      await expect(service.analyzeMedicines(undefined as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
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
        size: 11 * 1024 * 1024, // 11 MB > limit of 10 MB
      });

      await expect(service.analyzeMedicines(file)).rejects.toMatchObject({
        status: HttpStatus.PAYLOAD_TOO_LARGE,
      });
    });
  });

  describe('analyzeVaccines', () => {
    it('roteia image/png para ImageProcessor com VaccinesContext', async () => {
      const file = buildFile({ mimetype: 'image/png' });
      const expected = { vaccines: [{ name: 'BCG', date: '2020-01-01', dose: 'única' }] };
      imageProcessor.extract.mockResolvedValue(expected);

      const result = await service.analyzeVaccines(file);

      expect(imageProcessor.extract).toHaveBeenCalledWith(file, VaccinesContext);
      expect(result).toEqual(expected);
    });
  });
});
```

- [ ] **Step 3: Run to confirm failure**

```bash
npm test -- --testPathPattern=analyze.service.spec
```

Expected: FAIL — `AnalyzeService` not found.

- [ ] **Step 4: Implement AnalyzeService**

Create `src/modules/analyze/analyze.service.ts`:

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
  ) {}

  private resolveProcessor(mimeType: string): IProcessor {
    const type = MIME_TYPE_MAP[mimeType];
    if (!type) {
      throw new UnprocessableEntityException(`Unsupported file type: ${mimeType}`);
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
      throw new UnprocessableEntityException(`Unsupported file type: ${file.mimetype}`);
    }

    const maxMB = this.config.get<number>(MAX_SIZE_ENV_KEY[type], DEFAULT_MAX_MB[type]);
    if (file.size > maxMB * 1024 * 1024) {
      throw new HttpException(
        `File too large. Max: ${maxMB}MB`,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
  }

  async analyzeMedicines(file: Express.Multer.File): Promise<MedicinesAnalysisDto> {
    this.validateFile(file);
    const processor = this.resolveProcessor(file.mimetype);
    this.logger.log(`Analyzing medicines — mimeType: ${file.mimetype}`);
    return processor.extract<MedicinesAnalysisDto>(file, MedicinesContext);
  }

  async analyzeVaccines(file: Express.Multer.File): Promise<VaccinesAnalysisDto> {
    this.validateFile(file);
    const processor = this.resolveProcessor(file.mimetype);
    this.logger.log(`Analyzing vaccines — mimeType: ${file.mimetype}`);
    return processor.extract<VaccinesAnalysisDto>(file, VaccinesContext);
  }
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- --testPathPattern=analyze.service.spec
```

Expected: PASS — 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/modules/analyze/interfaces/analyze-service.interface.ts \
        src/modules/analyze/analyze.service.ts \
        src/modules/analyze/analyze.service.spec.ts
git commit -m "feat: add AnalyzeService with MIME routing and file validation"
```

---

### Task 7: AnalyzeController + AnalyzeModule + AppModule wiring

**Files:**
- Create: `src/modules/analyze/analyze.controller.ts`
- Create: `src/modules/analyze/analyze.module.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Consumes:
  - `ANALYZE_SERVICE`, `IAnalyzeService` from Task 6
  - `ApiKeyGuard` from Task 3
  - `AiModule` from Task 2
  - `AudioProcessor`, `ImageProcessor`, `PdfProcessor` from Task 4
- Produces:
  - `POST /api/analyze/medicines` (multipart) → `MedicinesAnalysisDto`
  - `POST /api/analyze/vaccines` (multipart) → `VaccinesAnalysisDto`

- [ ] **Step 1: Create AnalyzeController**

Create `src/modules/analyze/analyze.controller.ts`:

```typescript
import {
  Controller,
  Inject,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { MedicinesAnalysisDto } from './dto/medicines-analysis.dto';
import { VaccinesAnalysisDto } from './dto/vaccines-analysis.dto';
import {
  ANALYZE_SERVICE,
  IAnalyzeService,
} from './interfaces/analyze-service.interface';

@Controller('analyze')
@UseGuards(ApiKeyGuard)
export class AnalyzeController {
  constructor(
    @Inject(ANALYZE_SERVICE)
    private readonly analyzeService: IAnalyzeService,
  ) {}

  @Post('medicines')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  analyzeMedicines(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<MedicinesAnalysisDto> {
    return this.analyzeService.analyzeMedicines(file);
  }

  @Post('vaccines')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  analyzeVaccines(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<VaccinesAnalysisDto> {
    return this.analyzeService.analyzeVaccines(file);
  }
}
```

- [ ] **Step 2: Create AnalyzeModule**

`ApiKeyGuard` must be in `providers` so NestJS can resolve its `ConfigService` dependency when the controller uses `@UseGuards(ApiKeyGuard)`.

Create `src/modules/analyze/analyze.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AiModule } from '../../ai/ai.module';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { AnalyzeController } from './analyze.controller';
import { AnalyzeService } from './analyze.service';
import { ANALYZE_SERVICE } from './interfaces/analyze-service.interface';
import { AudioProcessor } from './processors/audio.processor';
import { ImageProcessor } from './processors/image.processor';
import { PdfProcessor } from './processors/pdf.processor';

@Module({
  imports: [AiModule],
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

- [ ] **Step 3: Register AnalyzeModule in AppModule**

In `src/app.module.ts`, add the import statement:

```typescript
import { AnalyzeModule } from './modules/analyze/analyze.module';
```

Add `AnalyzeModule` to the `imports` array after `UsersModule`:

```typescript
// Módulos de domínio
UsersModule,
AnalyzeModule,
```

- [ ] **Step 4: Build check**

```bash
npm run build
```

Expected: exits 0.

- [ ] **Step 5: Lint**

```bash
npm run lint
```

Expected: exits 0 (auto-fixes applied if any).

- [ ] **Step 6: Full test suite**

```bash
npm test
```

Expected: all unit tests pass.

- [ ] **Step 7: Smoke test the server**

Start the server in one terminal (requires `.env` with `API_KEY`, `GEMINI_API_KEY`, `DB_*`, `REDIS_URL`):

```bash
npm run start:dev
```

In another terminal:

```bash
# Should return 401
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/analyze/medicines
echo

# Should return 403
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/analyze/medicines \
  -H "X-Api-Key: wrong-key"
echo

# Should return 400 (no file)
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/analyze/medicines \
  -H "X-Api-Key: $(grep API_KEY .env | cut -d= -f2)"
echo
```

Expected outputs: `401`, `403`, `400`.

- [ ] **Step 8: Commit**

```bash
git add src/modules/analyze/analyze.controller.ts \
        src/modules/analyze/analyze.module.ts \
        src/app.module.ts
git commit -m "feat: add AnalyzeController, AnalyzeModule and wire into AppModule"
```

---

### Task 8: E2E tests + test fixtures

**Files:**
- Create: `test/fixtures/sample-receipt.jpg`
- Create: `test/fixtures/sample-receipt.pdf`
- Create: `test/analyze.e2e-spec.ts`

**Interfaces:**
- Consumes: `AnalyzeModule`, `AI_PROVIDER`, `ConfigService`, `HttpExceptionFilter`
- All AI calls mocked — no real Gemini calls, no database or Redis required

- [ ] **Step 1: Create test fixtures**

Run in terminal — creates minimal valid binary files for test uploads:

```bash
node -e "
const { writeFileSync, mkdirSync } = require('fs');
mkdirSync('test/fixtures', { recursive: true });

// Minimal 1x1 white JPEG
const jpegHex = 'ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffffc0000b080001000101011100ffda00080101000000001000ffd9';
writeFileSync('test/fixtures/sample-receipt.jpg', Buffer.from(jpegHex, 'hex'));

// Minimal valid PDF
const pdf = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF';
writeFileSync('test/fixtures/sample-receipt.pdf', pdf);

console.log('Fixtures created: sample-receipt.jpg, sample-receipt.pdf');
"
```

- [ ] **Step 2: Write the E2E test**

Create `test/analyze.e2e-spec.ts`:

```typescript
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as request from 'supertest';
import { AI_PROVIDER } from '../src/ai/ai-provider.port';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { AnalyzeModule } from '../src/modules/analyze/analyze.module';

describe('AnalyzeController (e2e)', () => {
  let app: INestApplication;
  let mockAiProvider: { analyze: jest.Mock };

  const API_KEY = 'test-api-key';
  const jpegFixture = readFileSync(join(__dirname, 'fixtures/sample-receipt.jpg'));
  const pdfFixture = readFileSync(join(__dirname, 'fixtures/sample-receipt.pdf'));

  beforeAll(async () => {
    mockAiProvider = { analyze: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      imports: [AnalyzeModule],
    })
      .overrideProvider(AI_PROVIDER)
      .useValue(mockAiProvider)
      .overrideProvider(ConfigService)
      .useValue({
        get: jest.fn((key: string, def?: unknown) => {
          const map: Record<string, unknown> = {
            API_KEY,
            AUDIO_MAX_SIZE_MB: 25,
            IMAGE_MAX_SIZE_MB: 10,
            PDF_MAX_SIZE_MB: 20,
          };
          return map[key] ?? def;
        }),
      })
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
      mockAiProvider.analyze.mockResolvedValue(expected);

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
      mockAiProvider.analyze.mockResolvedValue(expected);

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
      mockAiProvider.analyze.mockResolvedValue(expected);

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

- [ ] **Step 3: Run E2E tests**

```bash
npm run test:e2e -- --testPathPattern=analyze
```

Expected: PASS — 7 tests pass. No database or Redis required (all AI mocked, ConfigService mocked).

- [ ] **Step 4: Full unit test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Full build + lint**

```bash
npm run build && npm run lint
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add test/fixtures/ test/analyze.e2e-spec.ts
git commit -m "feat: add E2E tests and binary fixtures for analyze endpoints"
```

---

## Adding a new extraction endpoint

To add `POST /api/analyze/exams` in the future:

1. `src/modules/analyze/contexts/exams.context.ts` — new prompt + schema
2. `src/modules/analyze/dto/exams-analysis.dto.ts` — new DTO
3. `src/modules/analyze/interfaces/analyze-service.interface.ts` — add `analyzeExams()` to interface
4. `src/modules/analyze/analyze.service.ts` — implement `analyzeExams()`
5. `src/modules/analyze/analyze.controller.ts` — add `@Post('exams')` route

No changes to processors, adapters, or AiModule.
