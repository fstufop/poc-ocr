Você é um engenheiro backend sênior especializado em NestJS. Sua tarefa é gerar um **plano de implementação detalhado** baseado na especificação fornecida, respeitando os padrões da documentação oficial do NestJS (https://docs.nestjs.com) e as convenções deste skeleton.

**Spec ou feature:** $ARGUMENTS

## O que fazer

1. Leia o arquivo de spec indicado em `tasks/specs/`. Se não indicado, procure o mais recente.
2. Analise o codebase para entender o que já existe:
   - `src/modules/users/` — módulo de referência (padrão completo a seguir)
   - `src/common/` — filtros e interceptors reutilizáveis
   - `src/config/` — configuração de banco, cache e validação de env
   - `src/app.module.ts` — módulos já registrados
3. Identifique alternativas técnicas e escolha a melhor com justificativa.
4. Gere e **salve** o plano em `tasks/plans/[nome_feature]_plan.md`.

## Formato do arquivo de plano

```markdown
# Plano de Implementação: [Nome da Feature]

**Spec:** `tasks/specs/[nome]_spec.md`
**Data:** [data atual]

## Análise de Alternativas

| Alternativa | Descrição | Prós | Contras |
|---|---|---|---|
| A (Escolhida) | ... | ... | ... |
| B | ... | ... | ... |

**Decisão:** Alternativa A — [justificativa em 1-2 frases]

## Recursos Reutilizáveis Identificados
Liste filtros, interceptors, pipes ou services existentes que podem ser aproveitados.

## Diagrama de Fluxo

```
HTTP Request
    ↓ ValidationPipe (DTO)
[Nome]Controller
    ↓ token I[Nome]Service
[Nome]Service
    ↓ CACHE_MANAGER (cache hit?) → retorna direto
    ↓ Repository<[Nome]> → PostgreSQL
    ← Response
```

## Tarefas Sequenciais

### Tarefa 1 — [Entity] Definir entidade TypeORM
**Arquivo:** `src/modules/[nome]/entities/[nome].entity.ts`
**O que fazer:** Criar entity com campos da spec, `id` uuid, `createdAt`, `updatedAt`
**Depende de:** nada
**Testável:** `npm run build` sem erro

### Tarefa 2 — [Interface + DTOs] Definir contratos
**Arquivos:**
- `src/modules/[nome]/interfaces/[nome]-service.interface.ts` — token Symbol + interface `I[Nome]Service`
- `src/modules/[nome]/dto/create-[nome].dto.ts`
- `src/modules/[nome]/dto/update-[nome].dto.ts` (via `PartialType`)
**O que fazer:** Definir contrato do service e DTOs com validações `class-validator`
**Depende de:** nada (paralelo com Tarefa 1)
**Testável:** `npm run build`

### Tarefa 3 — [Service] Implementar lógica de negócio
**Arquivo:** `src/modules/[nome]/[nome].service.ts`
**O que fazer:** Implementar `I[Nome]Service` com `@InjectRepository` e `@Inject(CACHE_MANAGER)` onde a spec pedir cache
**Depende de:** Tarefas 1 e 2
**Testável:** testes unitários com mock do repositório e cache

### Tarefa 4 — [Controller] Implementar endpoints
**Arquivo:** `src/modules/[nome]/[nome].controller.ts`
**O que fazer:** Criar controller injetando o service via token da interface, com `ParseUUIDPipe` nos params
**Depende de:** Tarefa 3
**Testável:** testes e2e com supertest

### Tarefa 5 — [Module] Registrar e conectar
**Arquivo:** `src/modules/[nome]/[nome].module.ts`
**O que fazer:** `TypeOrmModule.forFeature([...])`, providers com `{ provide: [NOME]_SERVICE, useClass: [Nome]Service }`
**Depende de:** Tarefas 3 e 4
**Testável:** `npm run start:dev` sem erro de injeção

### Tarefa 6 — [App] Registrar módulo na aplicação
**Arquivo:** `src/app.module.ts`
**O que fazer:** Importar `[Nome]Module`
**Depende de:** Tarefa 5
**Testável:** `npm run start:dev` sobe sem erro

### Tarefa 7 — [Migration] Gerar migration da entity
**O que fazer:** `npm run migration:generate -- src/database/migrations/Create[Nome]`
**Depende de:** Tarefa 1
**Testável:** `npm run migration:run` aplica sem erro

### Tarefa 8 — [Testes] Testes unitários do Service
**Arquivo:** `src/modules/[nome]/[nome].service.spec.ts`
**O que fazer:** Cenários de sucesso, não encontrado e erro — repositório e cache mockados
**Depende de:** Tarefa 3
**Testável:** `npm run test`

### Tarefa 9 — [Testes] Testes e2e do Controller
**Arquivo:** `test/[nome].e2e-spec.ts`
**O que fazer:** Endpoint principal com supertest — 200/201, 400, 404
**Depende de:** Tarefa 4
**Testável:** `npm run test:e2e`

## Estimativa
| Tarefa | Complexidade | Estimativa |
|---|---|---|
| 1 — Entity | Baixa | 20 min |
| 2 — Interface + DTOs | Baixa | 30 min |
| 3 — Service | Alta | 1-2h |
| 4 — Controller | Média | 45 min |
| 5 — Module | Baixa | 20 min |
| 6 — App | Baixa | 5 min |
| 7 — Migration | Baixa | 15 min |
| 8 — Testes unitários | Média | 1h |
| 9 — Testes e2e | Média | 45 min |

## Riscos e Dependências
- Módulos NestJS que ainda precisam ser instalados
- Integrações externas necessárias
- Pontos de incerteza técnica
```

Após gerar o plano, apresente um **resumo** com:
- Número de tarefas e estimativa total
- Principais riscos identificados
- Pergunte se o dev quer ajustar a ordem ou abordagem antes de executar `/code`
