# Billing Lifecycle — FlipForm

## Objetivo
Definir o ciclo financeiro ponta-a-ponta da FlipForm, alinhando eventos Asaas, status interno, acesso ao app, auditoria e reconciliação.

## Matriz de status

| Evento Asaas | Status Asaas | Status interno | Acesso | Ação do sistema | Auditoria |
|---|---|---|---|---|---|
| PAYMENT_CONFIRMED | CONFIRMED | active (`received`) | Liberado | Ativa assinatura/tenant e limpa grace period | `billing.webhook.*` |
| PAYMENT_RECEIVED | RECEIVED | active (`received`) | Liberado | Ativa assinatura/tenant e allowed users | `billing.webhook.*` |
| PAYMENT_CREATED | PENDING | pending | Restrito conforme regra local | Mantém pendente, sem ativação indevida | `billing.webhook.*` |
| PAYMENT_OVERDUE | OVERDUE | past_due/overdue | Bloqueio progressivo | Define `past_due` + grace period | `billing.webhook.*` |
| PAYMENT_DELETED | DELETED | failed/cancelled-like | Bloqueado | Suspende se aplicável | `billing.webhook.*` |
| PAYMENT_REFUNDED | REFUNDED | refunded/suspended | Bloqueado | Suspende assinatura/tenant | `billing.webhook.*` |
| PAYMENT_CHARGEBACK_REQUESTED | CHARGEBACK_REQUESTED | chargeback/suspended | Bloqueado | Suspende assinatura/tenant | `billing.webhook.*` |
| PAYMENT_CHARGEBACK_DISPUTE | CHARGEBACK_DISPUTE | chargeback/suspended | Bloqueado | Suspende assinatura/tenant | `billing.webhook.*` |
| PAYMENT_AWAITING_RISK_ANALYSIS | AWAITING_RISK_ANALYSIS | pending_review | Restrito | Mantém pendente até confirmação | `billing.webhook.*` |

## Regras de acesso
- **active**: tenant ativo, acesso liberado.
- **pending**: sem liberação indevida de plano pago.
- **overdue/past_due**: bloqueio progressivo (grace period) e suspensão após expiração.
- **cancelled**: acesso bloqueado após cancelamento efetivo.
- **refunded/chargeback**: suspensão imediata até ação administrativa.

## Webhook
- Validação por `ASAAS_WEBHOOK_TOKEN`.
- Idempotência por `webhookEvent(provider,eventId)`.
- Eventos desconhecidos respondem com `ok` sem stack trace.
- Eventos duplicados não devem duplicar ativação/e-mail/token.

## Reconciliação
- Endpoint admin: `POST /api/admin/billing/reconcile`.
- Modos: `subscriptionId` **ou** `tenantId` **ou** `providerSubscriptionId`.
- Atualiza status local conforme provedor e recalcula acesso.

## Admin diagnostics
Usar `GET /api/admin/billing/diagnostics` para verificar:
- tenant/plano/status local;
- último webhook e último pagamento;
- divergência entre status local e provedor;
- última reconciliação.

## Testes sandbox
```bash
ASAAS_WEBHOOK_TOKEN='test-placeholder' \
WEBHOOK_URL='http://localhost:3000/api/webhooks/asaas' \
npm run asaas:webhook:simulate -- tests/fixtures/asaas/payment-confirmed.json

ASAAS_WEBHOOK_TOKEN='test-placeholder' \
WEBHOOK_URL='http://localhost:3000/api/webhooks/asaas' \
npm run asaas:webhook:simulate -- tests/fixtures/asaas/payment-overdue.json

ASAAS_WEBHOOK_TOKEN='test-placeholder' \
WEBHOOK_URL='http://localhost:3000/api/webhooks/asaas' \
npm run asaas:webhook:simulate -- tests/fixtures/asaas/payment-refunded.json
```

## Segurança
- Não usar Asaas produção em teste.
- Não enviar e-mail real em smoke.
- Não expor `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN`.
- Não logar token de first-access.
- Webhook duplicado não deve duplicar e-mail.

## Referência
- Ver também: `docs/operations/first-access-onboarding.md`.

## Referência
- Ver também: `docs/operations/observability-and-alerts.md`.
- Ver também: `docs/operations/incident-response.md`.

## Referência
- Ver também: `docs/operations/observability-and-alerts.md`.
- Ver também: `docs/operations/incident-response.md`.
- Ver também: `docs/operations/observability-and-alerts.md`.
- Ver também: `docs/operations/incident-response.md`.
## Relacionado
- [Final Production Readiness](./final-production-readiness.md)
- [Audit Handoff](./audit-handoff.md)

