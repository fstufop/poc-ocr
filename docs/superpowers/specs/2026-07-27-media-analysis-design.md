# Design: Media Analysis API (POC)

**Data:** 2026-07-27  
**Status:** Aprovado  
**Escopo:** POC — análise de áudio, imagem e PDF para extração de informações médicas estruturadas

---

## 1. Objetivo

Expor uma API HTTP que recebe arquivos de mídia (áudio, imagem ou PDF) enviados por aplicativos mobile (iOS/Swift e Android/Compose) e retorna, de forma estruturada em JSON, informações específicas identificadas por IA.

O caso de uso inicial é identificar **remédios e vacinas** em receitas médicas ou relatos de pacientes em áudio.

---

## 2. Requisitos

### Funcionais
- Receber arquivo via `multipart/form-data`
- Suportar áudio (MP3, WAV, M4A, OGG), imagem (JPEG, PNG, WEBP) e PDF
- Processar o arquivo com IA e retornar JSON estruturado com schema fixo por endpoint
- Autenticar requisições via API Key (`X-Api-Key`)

### Não funcionais
- Processamento síncrono (resposta na mesma requisição)
- Provedor de IA agnóstico — implementação inicial com Gemini
- Limites de tamanho configuráveis via variáveis de ambiente
- Timeout configurável para chamadas à IA

---

## 3. Arquitetura

### Princípio central

O **endpoint** representa **o que extrair** (conceito de negócio). O **tipo de mídia** é resolvido internamente pelo service, transparente para o cliente.

```
POST /api/analyze/medicines  +  (audio | image | pdf)
                                        │
                               AnalyzeService detecta MIME
                                        │
                         ┌──────────────┼──────────────┐
                    AudioProcessor  ImageProcessor  PdfProcessor
                         │               │               │
                         └───────────────┴───────────────┘
                                         │
                                   AIProviderPort  (interface)
                                         │
                                   GeminiAdapter   (implementação)
                                         │
                              { medicines: [...] }  ← schema fixo do endpoint
```

### Camadas

| Camada | Responsabilidade |
|---|---|
| `ApiKeyGuard` | Valida o header `X-Api-Key` antes de qualquer processamento |
| `AnalyzeController` | Recebe o arquivo, chama o service, retorna o DTO |
| `AnalyzeService` | Valida o arquivo, resolve o processor pelo MIME type, delega |
| `*Processor` | Prepara o arquivo para a IA (ex: buffer, encoding) e chama `AIProviderPort` |
| `AIProviderPort` | Interface — contrato único de comunicação com qualquer provedor de IA |
| `GeminiAdapter` | Implementação concreta do `AIProviderPort` usando Google Gemini |
| `*Context` | Encapsula o prompt e o schema de resposta fixo de cada endpoint |

---

## 4. Estrutura de Arquivos

```
src/
├── modules/
│   └── analyze/
│       ├── analyze.module.ts
│       ├── analyze.controller.ts
│       ├── analyze.service.ts
│       ├── contexts/
│       │   ├── medicines.context.ts       # prompt + schema para /medicines
│       │   └── vaccines.context.ts        # prompt + schema para /vaccines
│       ├── dto/
│       │   ├── medicines-analysis.dto.ts
│       │   └── vaccines-analysis.dto.ts
│       ├── processors/
│       │   ├── audio.processor.ts
│       │   ├── image.processor.ts
│       │   └── pdf.processor.ts
│       └── interfaces/
│           ├── analyze-service.interface.ts
│           └── processor.interface.ts
├── ai/
│   ├── ai.module.ts
│   ├── ai-provider.port.ts                # interface do provedor
│   └── adapters/
│       └── gemini.adapter.ts
└── common/
    └── guards/
        └── api-key.guard.ts
```

---

## 5. Contrato de API

### Autenticação

Todas as rotas exigem o header `X-Api-Key`.

| Situação | HTTP |
|---|---|
| Header ausente | 401 Unauthorized |
| Chave inválida | 403 Forbidden |

### Endpoints

#### `POST /api/analyze/medicines`

Identifica remédios em receitas médicas (imagem, PDF) ou em relatos de pacientes (áudio).

**Request**
```
X-Api-Key: <chave>
Content-Type: multipart/form-data

file: <áudio | imagem | PDF>
```

**Response 200**
```json
{
  "medicines": [
    {
      "name": "Amoxicilina",
      "dosage": "500mg",
      "frequency": "8h"
    }
  ]
}
```

---

#### `POST /api/analyze/vaccines`

Identifica vacinas em carteiras de vacinação (imagem, PDF) ou em relatos de pacientes (áudio).

**Request**
```
X-Api-Key: <chave>
Content-Type: multipart/form-data

file: <áudio | imagem | PDF>
```

**Response 200**
```json
{
  "vaccines": [
    {
      "name": "Febre Amarela",
      "date": "2024-03-15",
      "dose": "única"
    }
  ]
}
```

---

### Formatos e limites de arquivo

| Tipo | MIME types aceitos | Limite (env) |
|---|---|---|
| Áudio | `audio/mpeg`, `audio/wav`, `audio/mp4`, `audio/ogg` | `AUDIO_MAX_SIZE_MB=25` |
| Imagem | `image/jpeg`, `image/png`, `image/webp` | `IMAGE_MAX_SIZE_MB=10` |
| PDF | `application/pdf` | `PDF_MAX_SIZE_MB=20` |

---

## 6. Fluxo Interno

```
1. Request chega com X-Api-Key e arquivo multipart
2. ApiKeyGuard valida a chave → 401/403 se inválida
3. AnalyzeController passa o arquivo para AnalyzeService
4. AnalyzeService:
   a. Verifica se arquivo existe → 400 se ausente
   b. Valida MIME type → 422 se não suportado
   c. Valida tamanho → 413 se excede limite
   d. Resolve o Processor pelo MIME type
   e. Chama processor.extract(file, Context)
5. Processor prepara o buffer e chama AIProviderPort com o prompt do Context
6. GeminiAdapter envia o arquivo + prompt para a API Gemini
7. Resposta da IA é mapeada para o DTO do endpoint
8. Controller retorna o JSON ao cliente
```

---

## 7. Abstração do Provedor de IA

### Interface (`AIProviderPort`)

```typescript
interface AIProviderPort {
  analyze<T>(input: AIAnalysisInput): Promise<T>
}

interface AIAnalysisInput {
  fileBuffer: Buffer
  mimeType: string
  prompt: string
  responseSchema: object  // JSON Schema — instrui a IA a retornar JSON estruturado
}
```

O adapter usa o **structured output** (JSON mode) do provedor para garantir que a resposta já chegue como JSON válido conforme o schema. O Processor recebe o objeto tipado diretamente — sem parsing manual de texto.

O `Context` de cada endpoint define o `responseSchema` correspondente ao seu DTO de resposta.

### Troca de provedor

Para substituir o Gemini por outro provedor (ex: GPT-4o), basta criar um novo adapter implementando `AIProviderPort` e alterar o token `AI_PROVIDER` no `AiModule`. Nenhuma outra parte do código muda.

---

## 8. Tratamento de Erros

| Situação | HTTP | Mensagem |
|---|---|---|
| Nenhum arquivo enviado | 400 | `File is required` |
| MIME type não suportado | 422 | `Unsupported file type: {mime}` |
| Arquivo excede o limite | 413 | `File too large. Max: {N}MB` |
| IA retorna resposta malformada | 502 | `AI provider returned an unexpected response` |
| Timeout da IA | 504 | `AI provider timed out` |

Todos os erros passam pelo `HttpExceptionFilter` global:

```json
{
  "statusCode": 422,
  "message": "Unsupported file type: text/plain",
  "error": "Unprocessable Entity"
}
```

---

## 9. Variáveis de Ambiente

```dotenv
# Autenticação
API_KEY=

# Gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash

# Limites de arquivo
AUDIO_MAX_SIZE_MB=25
IMAGE_MAX_SIZE_MB=10
PDF_MAX_SIZE_MB=20

# IA
AI_TIMEOUT_MS=30000
```

---

## 10. Testes

### Unitários

| Alvo | O que testar |
|---|---|
| `AnalyzeService` | Roteamento por MIME type; `UnprocessableEntityException` para MIME inválido |
| `AudioProcessor` | Chama `AIProviderPort` com o buffer e prompt corretos |
| `ImageProcessor` | Idem |
| `PdfProcessor` | Idem |

`AIProviderPort` é mockado em todos os testes unitários.

### E2E

| Cenário | Esperado |
|---|---|
| `POST /analyze/medicines` com JPEG de receita | 200 + array `medicines` |
| `POST /analyze/medicines` com PDF | 200 + array `medicines` |
| `POST /analyze/medicines` sem arquivo | 400 |
| `POST /analyze/medicines` com MIME inválido | 422 |
| `POST /analyze/medicines` sem `X-Api-Key` | 401 |
| `POST /analyze/medicines` com chave errada | 403 |

Fixtures reais armazenadas em `test/fixtures/` (receita de exemplo em JPEG e PDF).

---

## 11. Adicionando novos endpoints

Para adicionar `POST /analyze/exams` (resultados de exames):

1. Criar `src/modules/analyze/contexts/exams.context.ts` com o prompt e schema
2. Criar `src/modules/analyze/dto/exams-analysis.dto.ts`
3. Adicionar rota no `AnalyzeController`
4. Adicionar método no `AnalyzeService`

Nenhuma mudança nos processors nem no adapter de IA.
