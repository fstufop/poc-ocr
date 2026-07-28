# Design: Token Usage Observability

**Data:** 2026-07-28
**Status:** Aprovado
**Escopo:** Capturar e expor o consumo de tokens da LLM por request, com agregação por período e por endpoint

---

## 1. Objetivo

Registrar de forma assíncrona o uso de tokens da LLM a cada request que aciona a IA, persistindo no banco de dados e expondo uma rota de consulta com agregação por período e por endpoint.

---

## 2. Requisitos

### Funcionais
- Capturar `inputTokens`, `outputTokens` e `totalTokens` retornados pelo provedor de IA a cada chamada
- Registrar o endpoint chamado, o provedor e o modelo utilizados
- Persistir o registro de forma assíncrona (fire-and-forget, sem bloquear a resposta ao cliente)
- Expor `GET /api/token-usage` com agregação por período e por endpoint

### Não funcionais
- Falha no registro de tokens não deve afetar a resposta ao cliente
- O contrato do `AIProviderPort` deve permanecer agnóstico ao provedor — a normalização ocorre em cada adapter
- Proteger `GET /api/token-usage` com `ApiKeyGuard`

---

## 3. Arquitetura

### Fluxo de captura

```
Request
  → ApiKeyGuard
  → AnalyzeController
  → AnalyzeService
      → resolve Processor (Audio | Image | Pdf)
      → processor.extract<T>(file, context)
          → AIProviderPort.analyze()   ← retorna { data: T, tokenUsage: TokenUsage }
      ← { data, tokenUsage }
  → tokenUsageService.record(...)     ← fire-and-forget (não aguarda)
  ← data T                            ← controller retorna só o dado ao cliente
```

### Camadas

| Camada | Mudança |
|---|---|
| `AIProviderPort` | `analyze<T>()` passa a retornar `Promise<{ data: T; tokenUsage: TokenUsage }>` |
| `GeminiAdapter` | Extrai `usageMetadata` da resposta Gemini e normaliza para `TokenUsage` |
| `IProcessor` | `extract<T>()` passa a retornar `Promise<{ data: T; tokenUsage: TokenUsage }>` |
| `AnalyzeService` | Desestrutura resultado, chama `tokenUsageService.record()` fire-and-forget, retorna `data` |
| `TokenUsageModule` | Novo módulo: entity, service (record + aggregate), controller (GET /token-usage) |

### Estrutura de arquivos

```
src/
├── ai/
│   ├── ai-provider.port.ts          # MODIFICAR — adicionar TokenUsage ao tipo de retorno
│   └── adapters/
│       └── gemini.adapter.ts        # MODIFICAR — extrair usageMetadata
├── modules/
│   ├── analyze/
│   │   ├── analyze.service.ts       # MODIFICAR — capturar tokenUsage, chamar record()
│   │   ├── analyze.module.ts        # MODIFICAR — importar TokenUsageModule
│   │   ├── interfaces/
│   │   │   └── processor.interface.ts  # MODIFICAR — retorno inclui tokenUsage
│   │   └── processors/
│   │       ├── audio.processor.ts   # MODIFICAR — retorno inclui tokenUsage
│   │       ├── image.processor.ts   # MODIFICAR — retorno inclui tokenUsage
│   │       └── pdf.processor.ts     # MODIFICAR — retorno inclui tokenUsage
│   └── token-usage/
│       ├── token-usage.module.ts
│       ├── token-usage.controller.ts
│       ├── token-usage.service.ts
│       ├── dto/
│       │   ├── record-token-usage.dto.ts
│       │   └── token-usage-query.dto.ts
│       │   └── token-usage-response.dto.ts
│       └── entities/
│           └── token-usage-record.entity.ts
└── database/
    └── migrations/
        └── 1753660800000-CreateTokenUsageTable.ts
```

---

## 4. Interface `TokenUsage`

Adicionada ao `src/ai/ai-provider.port.ts`:

```typescript
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}
```

`AIProviderPort.analyze<T>()` passa a retornar:

```typescript
Promise<{ data: T; tokenUsage: TokenUsage }>
```

`IProcessor.extract<T>()` passa a retornar o mesmo tipo — apenas repassa o que o adapter devolveu.

---

## 5. GeminiAdapter — extração de tokens

O `GeminiAdapter` extrai `usageMetadata` da resposta e normaliza:

```typescript
const usage = response.usageMetadata;
const tokenUsage: TokenUsage = {
  inputTokens: usage?.promptTokenCount ?? 0,
  outputTokens: usage?.candidatesTokenCount ?? 0,
  totalTokens: usage?.totalTokenCount ?? 0,
};
return { data: JSON.parse(response.text) as T, tokenUsage };
```

Quando `usageMetadata` for ausente (ex: timeout ou resposta malformada), os campos ficam `0` — as exceções `GatewayTimeoutException` e `BadGatewayException` ainda são lançadas normalmente antes de chegar nesse ponto.

---

## 6. Modelo de dados

### Entidade `TokenUsageRecord`

Tabela: `token_usage`

| Coluna | Tipo SQL | TypeORM | Descrição |
|---|---|---|---|
| `id` | `uuid` PK | `@PrimaryGeneratedColumn('uuid')` | Gerado automaticamente |
| `endpoint` | `varchar(255)` | `@Column()` | Ex: `analyze/medicines` |
| `provider` | `varchar(50)` | `@Column()` | Ex: `gemini` |
| `model` | `varchar(100)` | `@Column()` | Ex: `gemini-1.5-flash` |
| `input_tokens` | `integer` | `@Column('int')` | Tokens enviados ao modelo |
| `output_tokens` | `integer` | `@Column('int')` | Tokens gerados pelo modelo |
| `total_tokens` | `integer` | `@Column('int')` | Soma de input + output |
| `created_at` | `timestamptz` | `@CreateDateColumn()` | Timestamp do registro |

---

## 7. Contrato da API

### `GET /api/token-usage`

**Autenticação:** `X-Api-Key` (mesmo guard das rotas de análise)

**Query params (todos opcionais):**

| Param | Tipo | Default | Descrição |
|---|---|---|---|
| `from` | `string` (ISO date `YYYY-MM-DD`) | 30 dias atrás | Início do período |
| `to` | `string` (ISO date `YYYY-MM-DD`) | hoje | Fim do período (inclusivo) |
| `endpoint` | `string` | — | Filtrar por endpoint específico |

**Response 200:**

```json
{
  "from": "2026-07-01",
  "to": "2026-07-28",
  "totals": {
    "requestCount": 150,
    "inputTokens": 45000,
    "outputTokens": 12000,
    "totalTokens": 57000
  },
  "byEndpoint": [
    {
      "endpoint": "analyze/medicines",
      "requestCount": 100,
      "inputTokens": 30000,
      "outputTokens": 8000,
      "totalTokens": 38000
    }
  ],
  "byDay": [
    {
      "date": "2026-07-27",
      "requestCount": 15,
      "inputTokens": 4500,
      "outputTokens": 1200,
      "totalTokens": 5700
    }
  ]
}
```

---

## 8. AnalyzeService — integração

Após receber `{ data, tokenUsage }` do processor:

```typescript
// fire-and-forget — erro não afeta o cliente
this.tokenUsageService
  .record({
    endpoint: 'analyze/medicines',
    provider: 'gemini',
    model: this.configService.get<string>('GEMINI_MODEL', 'gemini-1.5-flash'),
    ...tokenUsage,
  })
  .catch((err) => this.logger.error('Failed to record token usage', err));

return data;
```

---

## 9. Tratamento de erros

| Situação | Comportamento |
|---|---|
| Falha no `record()` (DB fora do ar) | Erro logado via `Logger`, resposta ao cliente não é afetada |
| `usageMetadata` ausente na resposta Gemini | `tokenUsage` com zeros — registro salvo com zeros |
| Params inválidos em `GET /token-usage` | 400 via `ValidationPipe` global |

---

## 10. Testes

### Unitários

| Alvo | O que testar |
|---|---|
| `GeminiAdapter` | `tokenUsage` corretamente extraído do `usageMetadata`; zeros quando `usageMetadata` ausente |
| `AnalyzeService` | Chama `tokenUsageService.record()` com os campos corretos; falha no record não propaga |
| `TokenUsageService.aggregate()` | Agrupamento por dia e por endpoint; filtro de período aplicado |

`TokenUsageService` e `Repository<TokenUsageRecord>` mockados nos testes unitários de `AnalyzeService`.

### E2E

| Cenário | Esperado |
|---|---|
| `POST /api/analyze/medicines` com sucesso | Token usage gravado na tabela |
| `GET /api/token-usage` | 200 com estrutura correta |
| `GET /api/token-usage?from=invalid` | 400 |
| `GET /api/token-usage` sem `X-Api-Key` | 401 |
