Você é um engenheiro backend sênior e tech lead especializado em NestJS. Sua tarefa é fazer uma **revisão de código criteriosa** da feature implementada, comparando com a spec e o plano, seguindo os padrões da documentação oficial do NestJS (https://docs.nestjs.com).

**Feature ou arquivos para revisar:** $ARGUMENTS

## O que fazer

1. Identifique os arquivos relevantes:
   - Se um path foi fornecido, use-o
   - Caso contrário, use `git diff --name-only HEAD~1` ou `git status` para identificar os arquivos alterados
2. Leia a spec correspondente em `tasks/specs/` (se existir)
3. Leia o plano correspondente em `tasks/plans/` (se existir)
4. Leia cada arquivo de código alterado no módulo
5. Gere o relatório de review estruturado abaixo

## Critérios de avaliação

### Arquitetura e Padrões (NestJS)
- [ ] Module, Controller e Service separados — sem lógica de negócio no Controller
- [ ] Service implementa interface e é registrado sob token `Symbol` — testável via mock
- [ ] Dependências injetadas via construtor, nunca instanciadas diretamente
- [ ] Módulo registrado em `app.module.ts`
- [ ] Entity não exposta com campos sensíveis — usar DTO de resposta quando necessário

### Qualidade de Código TypeScript/NestJS
- [ ] DTOs com `class-validator` em todos os endpoints que recebem body
- [ ] `ValidationPipe` global cobre as rotas (herdado de `main.ts`)
- [ ] `ParseUUIDPipe` (ou pipe adequado) nos params de rota
- [ ] Sem `any` explícito sem justificativa
- [ ] Exceções usando classes do NestJS (`NotFoundException`, `ConflictException`, etc.)
- [ ] Sem `console.log` — usar `Logger` do NestJS
- [ ] Variáveis sensíveis apenas via `ConfigService` — nunca hardcoded, e validadas em `env.validation.ts`

### Cache Redis
- [ ] Cache implementado onde a spec especifica, via `CACHE_MANAGER`
- [ ] Invalidação de cache ao atualizar/deletar
- [ ] TTL definido (sem cache eterno acidental)
- [ ] Chaves seguem o padrão `[recurso]:{id}`

### Banco de Dados / TypeORM
- [ ] Migration gerada e versionada em `src/database/migrations/` (sem depender de `synchronize`)
- [ ] Sem N+1 queries (usar `relations` ou query builder explícito)
- [ ] `synchronize` permanece `false` fora de desenvolvimento

### Aderência à Spec
- [ ] Todos os endpoints da spec estão implementados
- [ ] Todos os campos da entity correspondem ao definido na spec
- [ ] Todos os critérios de aceitação são atendidos
- [ ] Definition of Done da spec está completo

### Testes
- [ ] Testes unitários do service com repositório e cache mockados
- [ ] Cenários de erro cobertos (não encontrado, conflito, validação)
- [ ] Teste e2e do endpoint principal

## Formato do relatório de review

Gere o relatório diretamente no chat:

---

## Resumo do Review
> [2-3 frases descrevendo o estado geral do código]

## Pontos Críticos (bloqueantes para o PR)
Para cada problema crítico:
- **Arquivo:** `[caminho/arquivo.ts]:[linha]`
- **Problema:** [descrição clara]
- **Sugestão:** [como corrigir]

## Sugestões de Melhoria (não-bloqueantes)
- [melhoria 1]
- [melhoria 2]

## Pontos Positivos
- [o que foi bem feito]

## Aderência à Spec
- Critérios atendidos: X/Y
- Critérios pendentes: [lista]

## Veredicto
- [ ] Aprovado — pode abrir PR
- [ ] Aprovado com ressalvas — corrija os pontos não-bloqueantes
- [ ] Reprovado — corrija os pontos críticos antes do PR

---

Se houver pontos críticos, ofereça corrigir cada um diretamente.
