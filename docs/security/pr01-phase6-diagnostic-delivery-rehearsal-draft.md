# PR01 — Fase 6 | Lease, tentativas persistentes e fila de descarte (DRAFT)

**19/11/2026 · PR #627 · `feature/pr01-global-api-foundation`.**

## Escopo efetivamente implementado

1. **Modelo `ApiV1OutboxEvent` estendido:** `nextAttemptAt`, `leaseToken`, `leaseUntil` e `updatedAt` para planejamento persistente; `state` continua **`held` por padrão**.
2. **Modelo aditivo `ApiV1DeliveryAttempt`:** trilha por `tenantId + integrationId + outboxEventId + attemptNo`, com único número de tentativa por evento, resultado, HTTP status **sintético** e momento de conclusão. FK composta impede histórico cruzado entre empresas. Sem payload de cliente.
3. **`lib/api-v1/diagnostic-delivery-state.ts`:** somente operações **CI-only** para enfileirar manualmente envelopes `diagnostic.ping`, obter lease com compare-and-set, registrar resultados **simulados**, recusar confirmação com lease antigo, aplicar backoff persistente, recuperar lease vencido e marcar `dead_letter` após cinco tentativas. O ledger e cada transição são gravados numa transação PostgreSQL.
4. **Nenhuma operação real:** o módulo exige ao mesmo tempo `CI=true`, flag API v1 no processo de teste e `DATABASE_URL` restrita a `postgresql://postgres@127.0.0.1:5432/flipform_ci`. Sem essas condições, a rotina falha bloqueada. Nenhuma rota, cron, worker real, conexão DNS/HTTP, token real, integração externa, liderança de fila ou envio é criado.
5. **Testes sintéticos**: 12 tentativas concorrentes de lease único, retries programados e não antecipados, bloqueio de ack com token antigo, quinto erro para `dead_letter`, lease vencido recuperado, quinta lease vencida descartada, isolamento de tenant A/B, dados inalterados com flag OFF.
6. **Auditoria do schema**: baseline PR00 de **92** modelos intacta, PR01 com **10** modelos explicitamente mapeados; soma 102 modelos. A checagem offline de SQL do PR00 permanece distinta: **nenhuma migration SQL foi gerada nem executada**.

## Limites de segurança e gates de publicação

- A confirmação `simulated_success` **não é entrega real**. O sistema atual não faz um único envio HTTP, não abre fila operativa e não consome dados de CRM/lead.
- Toda rotina de CI pode simular a transição de `held` para `queued` apenas para dados sintéticos. Não há política de consumidor humano, cron, credenciais, quotas globais ou execução em staging.
- O `leaseToken` é um identificador temporário de teste, não uma autorização para operação externa; auditoria e métricas em produção ainda exigem projeto próprio.
- Para futuro uso real: definir KMS/gestão de segredos por tenant, HMAC de saída, allowlist real, DNS re-resolution + IP pinning/TLS/egress firewall, não seguir redirects, worker autorizado, locks, limites globais, retenção e expurgo da fila, métricas e alarmes, DLQ/reativação manual auditada, política de idempotência de negócios e testes de rede adversarial. Estas tarefas **não estão concluídas**.
- PR00 e PRs #623–#626 mantêm gates de release. PR #627 fica **Draft**, sem deploy, merge, Neon, migrations, acesso a dados de clientes, alteração de Meta/Ads/Pixel, Stripe, WhatsApp ou workflows de reparação.
- O resultado técnico depende da conclusão de **Prisma validate, TypeScript, Smoke/DB, Playwright, Gitleaks e Semgrep**. SQL Offline Review ignorado não autoriza migrar banco.

**Parecer nesta fase:** somente programação isolada e testes descartáveis. **NO-GO para produção, runtime real e entrega de eventos.**
