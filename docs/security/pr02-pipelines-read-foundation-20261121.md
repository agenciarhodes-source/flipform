# PR02 — primeira operação útil da API: leitura de pipelines (Draft)

Data: 21/11/2026. Continuação incremental sobre a fundação PR01 (#627), sem merge, Neon, deployment, mudança produtiva, assinatura de serviço adicional nem chaves reais.

## Implementação de código entregue

- `GET /api/v1/pipelines?limit=20&after=<uuid>`: consulta paginada de até 50 pipelines não arquivados, incluindo apenas `id`, `name`, `isDefault` e etapas não arquivadas (`id`, `name`, `color`, `orderIndex`). Não lê leads, clientes, documentos, respostas de formulários ou conversas.
- Novo escopo específico `pipelines.read` vinculado a credencial M2M e à empresa autenticada. O `tenantId` vem exclusivamente de verificação do bearer; parâmetros de tenant desconhecidos são rejeitados. Escopos `events.write` e `webhooks.manage` seguem indisponíveis para emissão no endpoint administrativo.
- Administração do proprietário permite emitir **uma** chave de leitura de pipelines ou uma chave técnica de diagnóstico, com validade de 30 dias, exibição única, revogação e rotação existentes.
- A flag global `FLIPFORM_API_V1_ENABLED` continua **OFF** por padrão. Em 404 quando desligada, 401/403/429/503 em falha de autenticação, autorização, quota ou DB; não há fallback permissivo.
- Paginação por chave de ordenação imutável (`id`) e limite por consulta; `nextCursor=null` indica a última página.
- Testes offline e integração com dois tenants sintéticos via PostgreSQL descartável. O CI exige DB `127.0.0.1:5432/flipform_ci`, não conecta Neon nem utiliza dados reais.

## O que continua NÃO liberado

Este PR não habilita integração de ERP, escrita em pipeline, movimentação de leads, criação de pedidos ou webhook de produção. Não há migration nova neste passo, já que foram utilizados os modelos de pipeline existentes. A equipe deverá concluir gates de migração/privacidade/segregação e validação antes de publicar qualquer endpoint.

O rollout permanece marcado `NO_GO` em `docs/security/pr01-staging-release-gates-DRAFT.json`. A execução deste passo não precisa de Secure Compute Enterprise e não certifica rede de runtime.
