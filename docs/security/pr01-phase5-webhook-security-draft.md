# PR01 — Fase 5 | Webhook HMAC, anti-replay e política de egress (DRAFT)

**19/11/2026 · PR #627 · `feature/pr01-global-api-foundation`**.

## Entrega desta etapa (somente código + testes)

- **HMAC SHA-256** sobre bytes originais, timestamp UNIX, nonce e escopo confiável `(tenantId, integrationId)`; comparação em tempo constante. Janela de tolerância de até 300 segundos, nonce sintético de 16–96 caracteres, limite de corpo de 64 KiB. Assinatura inválida, antiga, futura, adulterada ou transferida para outro tenant é recusada antes da escrita.
- **`ApiV1WebhookReplay`**, modelo Prisma adicional: `(tenantId, integrationId, nonceHash)` único, hash do corpo e validade para retenção futura, FK composta para integração. A primeira requisição assinada e válida registra apenas os hashes. O mesmo nonce é rejeitado nas repetições, inclusive concorrentes. Sem banco, a rotina falha sem permitir bypass.
- **Exclusivamente `diagnostic.ping`**: o serviço não aceita dados de clientes nem guarda payload, segredo, token, assinatura ou nonce originais. A rotina é `server-only` e não há rota HTTP, fila, worker nem conexão com sistemas externos.
- **Política anti-SSRF de pré-checagem**: HTTPS, host exato em allowlist, credenciais e fragmentos proibidos, somente porta padrão e respostas DNS A públicas aceitas; IPv6 e destinos privados são recusados por enquanto. É uma função **offline**: não consulta DNS nem envia requisições. O envio real exigirá DNS no instante do uso, conexão presa ao IP aprovado, TLS/SNI e redirects desativados, além de egress firewall.
- **Política de retry e descarte**: função pura de backoff exponencial limitado para erros transitórios, com limite de cinco tentativas e classificação de dead-letter. Não há fila ativa nem persistência de tentativas nesta fase.
- **Auditoria PR00**: manter os 92 modelos anteriores e permitir apenas os 9 modelos aditivos explicitamente autorizados no schema PR01. **Migration não gerada nem executada**.
- **Testes offline e CI descartável**: assinatura, adulteração, janela temporal, escopo, HTTP/SSRF, retry; 10 gravações concorrentes (1 aceita e 9 rejeitadas); isolamento A/B; integração inativa e feature flag OFF; nenhuma nova entrada Inbox/Outbox.

## Bloqueios que permanecem

1. **Sem webhook real**: falta autorização específica para endpoint, gestão de segredo com cofre/KMS, provisionamento/rotação por tenant, verificação da identidade do provider e controles de autenticação e de tamanho no edge.
2. **Sem delivery**: não há egress, resolvedor DNS seguro, IP pinning, egress firewall, controle de redirects na camada HTTP, state machine de worker, lock/lease, retries persistentes, dead-letter queue, métricas, retenção/limpeza ou provas de entrega.
3. **Sem dados reais**: testes usam somente empresas fictícias e PostgreSQL descartável `flipform_ci`. Integrações com Ads/Pixel, Meta/Google, WhatsApp, Stripe, CRM, leads e pipelines permanecem intocadas.
4. **Sem release**: PR #627 continua Draft e com `feature/pr01-global-api-foundation` sem deployment via Vercel. Não executar migrations Neon, merge, deploy nem reativar workflows de reparação.
5. A revisão SQL offline do PR00 é **skipped**; por isso o schema ainda exige geração de diff SQL/migration, análise de rollback e homologação isolada antes de qualquer execução real.

**Decisão:** GO somente para desenvolvimento sintético. NO-GO para conexão real, produção, staging com dados de clientes ou publicação.
