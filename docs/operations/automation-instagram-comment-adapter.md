# Instagram Comment → Automation Core adapter

## Objetivo

Este adapter conecta o domínio de comentários do Instagram ao `Automation Core v1` sem substituir o runtime legado nesta etapa.

Ele introduz dois contratos explícitos:

- trigger `instagram.comment.keyword`;
- action `instagram.private_reply`.

## Trigger adapter

`prepareInstagramCommentCoreAutomation(...)` consulta somente definições genéricas habilitadas para o tenant e mantém a mesma normalização e semântica de correspondência usadas pela automação específica já existente (`exact` e `contains`). A primeira definição habilitada, respeitando a ordem do core, é selecionada.

`enqueueInstagramCommentCoreAutomation(...)` recebe a definição preparada e grava uma execução pelo `enqueueAutomationExecution(...)`. O `sourceEventKey` continua sendo responsabilidade do caller e deve representar de forma estável o comentário externo. O `executionInput` contém apenas identificadores e texto necessários ao runtime; nenhuma credencial Meta é colocada na fila.

## Action handler

`createInstagramPrivateReplyAutomationHandler()` implementa `instagram.private_reply` reutilizando `enqueueAndDispatchInstagramPrivateReply(...)`.

O handler:

- resolve um usuário ativo do mesmo tenant com `INTEGRATIONS_EDIT`;
- usa a `idempotencyKey` estável fornecida pelo Automation Core;
- converte `in_progress` em retry interno;
- trata `delivery_unknown` como terminal, sem blind retry;
- trata `ALREADY_REPLIED` como `skipped`, preservando a regra de uma tentativa de private reply por comentário;
- não lê nem altera Lead, Kanban, Pipeline, Conversation ou Message.

## Sem cutover neste PR

O webhook oficial do Instagram continua chamando `drainInstagramCommentAutomationQueue()` e a automação específica continua sendo a responsável pelas regras existentes.

Este adapter ainda não é chamado pelo webhook e o worker genérico ainda não é drenado por essa rota. Isso é intencional: a ponte é adicionada primeiro para que o próximo passo possa migrar/cutover de maneira controlada, com compatibilidade e rollback claros.

Não há migration, backfill, alteração no `schema.prisma`, criação de Lead, movimentação de Kanban ou IA nesta etapa.
