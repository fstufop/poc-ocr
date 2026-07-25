Você é um engenheiro backend sênior especializado em NestJS e arquitetura orientada a módulos. Sua tarefa é gerar uma **especificação técnica completa** para o módulo ou feature descrita abaixo, seguindo os padrões da documentação oficial do NestJS (https://docs.nestjs.com) e as convenções deste skeleton.

**Feature solicitada:** $ARGUMENTS

## O que fazer

1. Leia `src/app.module.ts` para entender os módulos já registrados.
2. Navegue em `src/modules/` (use `src/modules/users/` como referência do padrão) para seguir a mesma estrutura.
3. Leia `src/common/` (filtros, interceptors) e `src/config/` para identificar recursos reutilizáveis.
4. Gere e **salve** a especificação em `tasks/specs/[nome_feature]_spec.md`.

## Formato do arquivo de especificação

```markdown
# Spec: [Nome da Feature]

## 1. Objetivo
> Por que esse módulo existe? Qual problema de negócio ele resolve?

## 2. Descrição Funcional
O que o módulo faz. Liste em bullets.

## 3. Estrutura de Arquivos

### Novos arquivos
- `src/modules/[nome]/[nome].module.ts`
- `src/modules/[nome]/[nome].controller.ts`
- `src/modules/[nome]/[nome].service.ts`
- `src/modules/[nome]/[nome].service.spec.ts`
- `src/modules/[nome]/dto/create-[nome].dto.ts`
- `src/modules/[nome]/dto/update-[nome].dto.ts`
- `src/modules/[nome]/entities/[nome].entity.ts`
- `src/modules/[nome]/interfaces/[nome]-service.interface.ts`

### Arquivos modificados
- `src/app.module.ts` — importar o novo módulo

## 4. Contrato de API

Para cada endpoint:

| Campo     | Valor                            |
|-----------|----------------------------------|
| Método    | GET / POST / PATCH / DELETE      |
| Path      | `/[recurso]`                     |
| Body DTO  | `Create[Nome]Dto`                |
| Resposta  | `[Nome]` / `void`                |
| Status    | 200 / 201 / 204                  |

## 5. Entidade (PostgreSQL / TypeORM)

```typescript
// Campos esperados na entidade TypeORM
id: string (uuid)
// ... campos específicos
createdAt: Date
updatedAt: Date
```

## 6. Cache (Redis)

Descreva o que deve ser cacheado, a chave e o TTL:
- Chave: `[recurso]:{id}`
- TTL: [N] milissegundos (herda `CACHE_TTL` se não especificado)
- Quando invalidar (create / update / delete)

Se não usa cache, indique "Sem cache para este módulo".

## 7. Interface do Service

```typescript
export const [NOME]_SERVICE = Symbol('[NOME]_SERVICE');

export interface I[Nome]Service {
  // métodos do contrato — para permitir mock nos testes
}
```

## 8. DTOs e Validações

```typescript
// Create[Nome]Dto — campos obrigatórios e opcionais com class-validator
```

## 9. Critérios de Aceitação (BDD)

```gherkin
Feature: [Nome da Feature]

  Scenario: Fluxo principal com sucesso
    Given [pré-condição]
    When [ação / requisição]
    Then [resultado esperado]

  Scenario: Erro de validação
    Given [pré-condição]
    When o body é inválido
    Then retorna 400 com detalhes dos campos inválidos

  Scenario: Recurso não encontrado
    Given um id inexistente
    When a requisição é feita
    Then retorna 404
```

## 10. Definition of Done
- [ ] Module registrado em `app.module.ts`
- [ ] Controller com validação via `ValidationPipe` global + DTOs
- [ ] Service registrado sob o token da interface (`{ provide: [NOME]_SERVICE, useClass: ... }`)
- [ ] Entity TypeORM com `id` uuid e timestamps
- [ ] DTOs com decorators `class-validator`
- [ ] Cache Redis implementado onde especificado (via `CACHE_MANAGER`)
- [ ] Testes unitários do Service (mock do repositório e do cache)
- [ ] Testes e2e do endpoint principal
```

Após gerar a especificação, apresente um **resumo** com:
- Nome do arquivo salvo
- Lista dos arquivos que serão criados/modificados
- Principais critérios de aceitação
- Pergunte se o dev quer ajustar algo antes de seguir para `/plan`
