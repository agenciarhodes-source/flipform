# Webhooks and Jobs Inventory

## Webhook Asaas
- **Provedor:** Asaas
- **Endpoint:** `POST /api/webhooks/asaas`
- **Token/header:** `ASAAS_WEBHOOK_TOKEN` (header de autenticação)
- **Eventos aceitos:** confirmação/recebimento/pendente/atraso/refund/chargeback (conforme implementação)
- **Idempotência:** baseada em registro/auditoria de eventos processados
- **Ações:** atualização de subscription/access, gatilho de first-access/e-mail
- **Audit log:** `logPlatformAudit` e logs observáveis
- **Risco:** alto (receita + ativação)
- **Teste:** `scripts/simulate-asaas-webhook.ts` com fixtures sandbox

## Jobs internos
### `POST /api/internal/jobs/reconcile-billing`
- **Objetivo:** reconciliação interna de billing
- **Auth:** `CRON_SECRET`
- **Frequência recomendada:** diária/horária conforme operação
- **Efeito colateral:** atualização de status de acesso/faturamento
- **Risco:** alto
- **Execução manual:** chamada autenticada interna
- **Auditoria:** logs e trilha admin billing

### `POST /api/cron/billing-status`
- **Objetivo:** sincronizar status de billing
- **Auth:** `CRON_SECRET`
- **Frequência:** cron recorrente
- **Risco:** médio/alto

### `POST /api/admin/billing/reconcile`
- **Objetivo:** reconciliação manual sob demanda
- **Auth:** platform admin
- **Frequência:** on-demand
- **Risco:** alto
- **Auditoria:** evento de reconciliação com ator admin

### `GET /api/health/readiness`
- **Objetivo:** readiness protegido
- **Auth:** `x-internal-secret: INTERNAL_JOB_SECRET`
- **Risco:** médio (não expor checks sensíveis)
