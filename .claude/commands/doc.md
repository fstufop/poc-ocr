Você é um engenheiro backend sênior especializado em NestJS. Sua tarefa é **documentar ou fazer engenharia reversa** de um módulo existente, extraindo regras de negócio e gerando documentação estruturada, alinhada aos padrões da documentação oficial do NestJS (https://docs.nestjs.com).

**Módulo ou feature:** $ARGUMENTS

## O que fazer

Há dois modos de uso:

**Modo A — Documentar módulo recém-implementado** (após merge)
Execute engenharia reversa dos arquivos do módulo e gere documentação completa.

**Modo B — Entender código existente**
Mapeie o fluxo de um módulo legado/existente para entender o que ele faz.

## Passos

1. Identifique os arquivos relevantes:
   - Módulos: `src/modules/[nome]/`
   - Se um path foi fornecido, use-o diretamente
2. Leia todos os arquivos do módulo (module, controller, service, DTOs, entity, interfaces)
3. Trace o fluxo completo de dados (Request → Controller → Service → Redis/PostgreSQL → Response)
4. Extraia as regras de negócio implícitas no código
5. Gere e **salve** a documentação em `tasks/drafts/[nome_modulo]_doc.md`

## Formato da documentação gerada

```markdown
# Documentação: [Nome do Módulo]

**Data:** [data atual]
**Tipo:** Módulo Novo / Módulo Existente
**Arquivos analisados:** [lista]

## Visão Geral
[2-3 frases descrevendo o que o módulo faz e por que existe]

## Fluxo de Dados

```
HTTP Request
    ↓ ValidationPipe: [Nome]Dto
[Nome]Controller.[método]()
    ↓ token I[Nome]Service
[Nome]Service.[método]()
    ↓ cache.get([recurso]:{id})  ← cache hit?
    ↓ [Nome]Repository.findOne(...)  ← PostgreSQL
    ↓ cache.set(...)  ← atualiza cache
← Response
```

## Regras de Negócio Identificadas

### RN-01: [Nome da Regra]
**Onde no código:** `[nome].service.ts:[linha]`
**Descrição:** [o que a regra faz]
**Condição:** [quando se aplica]

### RN-02: [Nome da Regra]
...

## Endpoints Expostos

| Método | Path | DTO | Descrição |
|--------|------|-----|-----------|
| POST | `/[recurso]` | Create[Nome]Dto | [descrição] |
| GET | `/[recurso]/:id` | — | [descrição] |

## Entidade PostgreSQL

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | uuid | Identificador único |
| `[campo]` | `[tipo]` | [descrição] |
| `createdAt` | timestamp | Criação |
| `updatedAt` | timestamp | Atualização |

## Estratégia de Cache Redis

| Chave | TTL | Quando invalida |
|-------|-----|-----------------|
| `[recurso]:{id}` | [N]ms | update / delete |

Se não usa cache: "Módulo sem cache Redis."

## Critérios de Aceitação (extraídos do código)

```gherkin
Feature: [Nome do Módulo]

  Scenario: [Fluxo principal]
    Given [estado inicial extraído do código]
    When [requisição ao endpoint]
    Then [resposta esperada]

  Scenario: Recurso não encontrado
    Given um id inexistente
    When requisição ao endpoint
    Then retorna 404
```

## Variáveis de Ambiente Necessárias

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `[VAR]` | [descrição] | `[valor exemplo]` |

## Dependências

- Módulos NestJS usados
- APIs externas chamadas
- Outros módulos internos importados

## Pontos de Atenção / Dívida Técnica
- [algo que deveria ser melhorado]
- [comportamento não óbvio que merece comentário]
```

Após gerar a documentação:
1. Informe o caminho do arquivo salvo
2. Destaque as **regras de negócio mais importantes** em 3-5 bullets
3. Aponte qualquer **dívida técnica ou inconsistência** encontrada no código
