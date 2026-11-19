# PR01 — Fase 4 | Idempotência durável e envelopes Inbox/Outbox (DRAFT)

**19/11/2026** · PR #627 · branch `feature/pr01-global-api-foundation` · sem merge, preview/deploy, Neon ou migration.

## Implementado somente como código isolado

1. **`ApiV1IdempotencyRecord`**: claim exclusivo `(tenantId,integrationId,operation,keyHash)`, armazenando hash (não a chave do cliente) e fingerprint do pedido.
2. **`ApiV1InboxEvent`**: envelope de entrada associado ao claim com FK composta por tenant e integração; guarda tipo e hash da requisição, **sem payload de cliente**.
3. **`ApiV1OutboxEvent`**: envelope de saída com FK composta para o Inbox, com `state=held` e `attempts=0`; não há despachante.
4. **`recordApiV1DiagnosticEvent`**: serviço `server-only`, sem route/controller; aceita **somente** envelope `diagnostic.ping` de teste, recebido com contexto de uma autorização M2M previamente validada e escopo `events.write`. A API desativada nega qualquer gravação.
5. Transação PostgreSQL inclui claim, Inbox e Outbox; o índice único evita duplicação mesmo sob concorrência entre processos. Para a mesma chave+fingerprint o resultado reaproveita o mesmo receipt; reutilizar a chave com conteúdo diferente gera conflito, sem criar novo envelope.
6. Auditor de schema mantém a linha de base **92 modelos** e limita as adições de PR01 a **oito modelos explicitamente identificados**; testes sintéticos somente no banco descartável `flipform_ci`.

## Cuidados de segurança e limitações

- **Sem endpoint HTTP funcional.** A rota `/api/v1/status` preserva o comportamento 404/503, independentemente desta alteração. A flag não deve ser ativada nos ambientes reais.
- **Sem payload real armazenado:** os envelopes não são entregáveis. A execução de webhooks, filas de entrega, HMAC, deduplicação por provider, retry/backoff, SSRF/egress, DLQ, auditoria de acesso, retenção/expurgo e configuração de destinos **ainda não existem**.
- O serviço espera uma autorização **verificada no servidor**; nunca deve aceitar o objeto `authorization` vindo do JSON da requisição. Esse vínculo só poderá ser feito em endpoint após revisão específica.
- **Não executamos** SQL ou migrations em Neon, mudanças de billing, Ads/Pixel, CRM/Lead/Pipeline, Stripe, Vercel, workflows de reparação nem chaves reais.
- A política de publicação e o Plano Mestre v6.1 seguem bloqueando integração à main até aceites específicos; não converter PR Draft para Ready for review.
- O checklist de reversão, enquanto código ainda não publicado, é reverter os commits da Fase 4. Qualquer migration futura precisará de plano adicional validado em DB descartável antes de execução real.

## Critérios de aceite no CI

- Concorrência de 8 gravações idênticas produz exatamente 1 claim, 1 Inbox, 1 Outbox e 7 replays; replay retorna IDs originais.
- A mesma chave com novo fingerprint gera conflito sem escrita.
- Chaves iguais de empresas distintas são independentes; FK rejeita associação de Outbox B ao Inbox A.
- Inativos, flag OFF, escopos insuficientes e chaves malformadas negam acesso; todos os envelopes ficam em `held`.
- Devem ficar verdes Prisma generate/validate, typecheck, testes Python, integração PostgreSQL descartável, Smoke, Playwright, Semgrep e Gitleaks. A revisão SQL offline da auditoria PR00 pode continuar **skipped**, portanto não é homologação de migration.

**Resultado desta Fase 4:** fundação transacional demonstrável, sem nenhuma integração externa ativa nem evento real de cliente.
