# CLAUDE.md — Guardrails do projeto

Instruções para agentes de IA (Claude Code) trabalhando neste repositório.
A **documentação oficial do NestJS (https://docs.nestjs.com) é a fonte de verdade** para qualquer decisão de arquitetura ou padrão. Em caso de conflito entre este arquivo e a doc oficial, prevalece a doc oficial — atualize este arquivo se necessário.

## Stack

- **NestJS 11** (Node 22, TypeScript, CommonJS)
- **TypeORM 0.3** + **PostgreSQL** — persistência
- **@nestjs/cache-manager** + **Keyv/Redis** — cache de dois níveis (memória + Redis)
- **@nestjs/config** + **class-validator** — configuração tipada e validada no boot
- **@nestjs/terminus** — health checks (`GET /health`)
- **Jest** + **supertest** — testes unitários e e2e

## Estrutura

```
src/
├── main.ts                  # bootstrap, ValidationPipe global, prefixo de API
├── app.module.ts            # composição raiz + APP_FILTER e APP_INTERCEPTOR globais
├── config/                  # configuration.ts, env.validation.ts, database.config.ts
├── cache/                   # RedisCacheModule (cache global via CACHE_MANAGER)
├── common/                  # filters/, interceptors/ reutilizáveis
├── database/                # data-source.ts (CLI de migrations) + migrations/
├── health/                  # health check de DB e Redis
└── modules/                 # um diretório isolado por feature de domínio
    └── users/               # MÓDULO DE REFERÊNCIA — copie este padrão
```

## Convenções obrigatórias

1. **Um módulo por feature** em `src/modules/[nome]/` com module, controller, service, `dto/`, `entities/`, `interfaces/`.
2. **Service dirigido por interface:** todo service implementa `I[Nome]Service` e é registrado sob um token `Symbol` (`{ provide: [NOME]_SERVICE, useClass: [Nome]Service }`). Controllers injetam pelo token — nunca pela classe concreta.
3. **Injeção de dependência sempre via construtor.** Nunca instanciar dependências com `new`.
4. **Configuração via `ConfigService`.** Nada de segredos/URLs hardcoded. Toda variável nova entra em `.env.example` e no schema de `src/config/env.validation.ts`.
5. **Validação na borda.** `ValidationPipe` global (whitelist + transform) já ativo em `main.ts`; todo body tem DTO com `class-validator`. Params de rota usam `ParseUUIDPipe` quando forem uuid.
6. **Cache Redis** via `@Inject(CACHE_MANAGER)`. Chaves no padrão `[recurso]:{id}`. Sempre invalidar no update/delete e nunca cachear sem TTL.
7. **Exceções** com as classes do NestJS (`NotFoundException`, `ConflictException`, ...). O `HttpExceptionFilter` global padroniza o corpo de erro.
8. **Logs** via `Logger` do NestJS — nunca `console.log`.
9. **Banco:** `synchronize` fica `false`. Mudanças de schema viram **migration** versionada em `src/database/migrations/`.
10. **Testes:** service com repositório e `CACHE_MANAGER` mockados; endpoint principal coberto por e2e.

## Fluxo de desenvolvimento assistido por IA

Comandos em `.claude/commands/` (ver `tasks/README.md`):

| Comando | Faz | Salva em |
|---|---|---|
| `/spec <feature>` | Especificação técnica (API, entity, cache, BDD) | `tasks/specs/` |
| `/plan <feature>` | Plano com tarefas sequenciais e estimativas | `tasks/plans/` |
| `/code <feature>` | Implementa uma tarefa por vez seguindo o plano | código |
| `/review <feature>` | Revisão criteriosa contra spec/plano | chat |
| `/doc <feature>` | Documenta / engenharia reversa de um módulo | `tasks/drafts/` |

## Comandos úteis

```bash
npm run start:dev        # dev com watch
npm run build            # compila para dist/
npm run lint             # eslint --fix
npm run test             # testes unitários
npm run test:e2e         # testes e2e (requer Postgres + Redis)
npm run migration:generate -- src/database/migrations/NomeDaMigration
npm run migration:run    # aplica migrations pendentes
docker compose up -d postgres redis   # sobe dependências locais
```

## Ao concluir uma feature

`npm run build` + `npm run lint` + `npm run test` devem passar. Rode `/review` antes de abrir o PR e atualize `.env.example` se houver variável nova.
