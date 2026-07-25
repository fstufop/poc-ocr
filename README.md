# NestJS Skeleton

Template base de NestJS para iniciar qualquer projeto backend, com **PostgreSQL (TypeORM)**, **cache Redis** e um **fluxo de desenvolvimento assistido por IA** (Claude Code) embutido. Segue os padrões da [documentação oficial do NestJS](https://docs.nestjs.com).

## O que vem incluído

- ⚙️ **Configuração tipada e validada** — `@nestjs/config` + `class-validator` validam o `.env` no boot (a app não sobe com env inválido)
- 🗄️ **TypeORM + PostgreSQL** — com migrations por CLI e `autoLoadEntities`
- ⚡ **Cache Redis de dois níveis** — memória local (LRU) + Redis compartilhado via `@nestjs/cache-manager` e Keyv
- ❤️ **Health checks** — `GET /health` verifica banco e Redis (`@nestjs/terminus`)
- 🧱 **Módulo de exemplo `users`** — CRUD completo servindo de referência do padrão
- 🛡️ **Guardrails globais** — `ValidationPipe`, filtro de exceções e interceptor de logging já ligados
- 🤖 **Fluxo de IA** — comandos `/spec`, `/plan`, `/code`, `/review`, `/doc` em `.claude/commands/`
- 🐳 **Docker** — `docker-compose.yml` (Postgres + Redis + app) e `Dockerfile` multi-stage

## Requisitos

- Node.js 22+
- npm 10+
- Docker (para Postgres e Redis locais)

## Começando

```bash
# 1. Instalar dependências
npm install

# 2. Criar o .env a partir do exemplo
cp .env.example .env

# 3. Subir Postgres e Redis
docker compose up -d postgres redis

# 4. Rodar as migrations (após criar alguma)
npm run migration:run

# 5. Subir a aplicação em modo dev
npm run start:dev
```

A API sobe em `http://localhost:3000/api` (prefixo configurável via `API_PREFIX`).
Health check: `http://localhost:3000/api/health`.

## Estrutura

```
src/
├── main.ts                  # bootstrap + ValidationPipe global
├── app.module.ts            # composição raiz
├── config/                  # configuração, validação de env, config do TypeORM
├── cache/                   # módulo de cache Redis global
├── common/                  # filtros e interceptors reutilizáveis
├── database/                # data-source de migrations + migrations/
├── health/                  # health checks (DB + Redis)
└── modules/users/           # módulo de referência (CRUD completo)
```

## Scripts

| Script | Descrição |
|---|---|
| `npm run start:dev` | Dev com hot-reload |
| `npm run build` | Compila para `dist/` |
| `npm run start:prod` | Roda o build de produção |
| `npm run lint` | ESLint com `--fix` |
| `npm run test` | Testes unitários |
| `npm run test:e2e` | Testes e2e (requer Postgres + Redis) |
| `npm run test:cov` | Cobertura |
| `npm run migration:generate -- src/database/migrations/Nome` | Gera migration a partir das entities |
| `npm run migration:run` | Aplica migrations pendentes |
| `npm run migration:revert` | Reverte a última migration |

## Criando uma nova feature (fluxo com IA)

Use o Claude Code no diretório do projeto:

```
/spec pedidos      # gera a especificação técnica
/plan pedidos      # gera o plano de implementação
/code pedidos      # implementa tarefa por tarefa
/review pedidos    # revisa antes do PR
/doc pedidos       # documenta o módulo
```

Os artefatos ficam versionados em `tasks/` (veja `tasks/README.md`).
As regras que os agentes seguem estão em `CLAUDE.md`.

## Variáveis de ambiente

Veja `.env.example`. As principais:

| Variável | Descrição | Padrão |
|---|---|---|
| `PORT` | Porta HTTP | `3000` |
| `API_PREFIX` | Prefixo global das rotas | `api` |
| `DB_HOST` / `DB_PORT` | PostgreSQL | `localhost` / `5432` |
| `DB_USERNAME` / `DB_PASSWORD` / `DB_DATABASE` | Credenciais do banco | `postgres` / `postgres` / `app` |
| `DB_SYNCHRONIZE` | Sincroniza schema (nunca `true` em produção) | `false` |
| `REDIS_URL` | URL do Redis | `redis://localhost:6379` |
| `CACHE_TTL` | TTL padrão do cache (ms) | `60000` |

## Docker (stack completa)

```bash
# Sobe Postgres, Redis e a aplicação buildada
docker compose --profile full up -d --build
```

## Licença

UNLICENSED — ajuste conforme o seu projeto.
