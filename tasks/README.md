# tasks/ — Artefatos do fluxo de desenvolvimento via IA

Esta pasta guarda os artefatos gerados pelos comandos de `.claude/commands/`.
O fluxo recomendado para qualquer nova feature é:

```
/spec <feature>   →  tasks/specs/<feature>_spec.md      (o quê e por quê)
      ↓
/plan <feature>   →  tasks/plans/<feature>_plan.md      (como, em tarefas)
      ↓
/code <feature>   →  implementação, uma tarefa por vez
      ↓
/review <feature> →  revisão criteriosa antes do PR
      ↓
/doc <feature>    →  tasks/drafts/<feature>_doc.md      (documentação final)
```

## Estrutura

- `specs/` — especificações técnicas (contrato de API, entity, cache, BDD)
- `plans/` — planos de implementação com tarefas sequenciais e estimativas
- `drafts/` — documentação e engenharia reversa de módulos

Os artefatos são versionados junto ao código para manter rastreabilidade
entre a decisão de design e a implementação.
