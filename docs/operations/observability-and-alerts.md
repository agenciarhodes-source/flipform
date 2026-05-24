# Observability and Alerts — FlipForm

## Objetivo
Monitorar falhas críticas da FlipForm e facilitar diagnóstico rápido sem exposição de dados sensíveis.

## Eventos críticos
- checkout_failed
- asaas_webhook_failed
- asaas_webhook_invalid_token
- billing_reconciliation_failed
- activation_email_failed
- first_access_failed
- admin_action_failed
- cron_failed
- database_unavailable
- env_invalid

## Sentry (envs)
- SENTRY_DSN=
- NEXT_PUBLIC_SENTRY_DSN=
- SENTRY_ORG=
- SENTRY_PROJECT=
- SENTRY_AUTH_TOKEN=

## Nunca logar
senhas, tokens, cookies, Authorization, DATABASE_URL, JWT secrets, ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN, SMTP_PASSWORD, RESEND_API_KEY, URL completa de first-access.

## Healthchecks
- `GET /api/health`
- `GET /api/health/readiness` com `x-internal-secret`

## Alertas recomendados
- Aumento anormal de 5xx
- Falha recorrente de webhook Asaas
- Falha de envio de e-mail
- Falha de checkout
- Falha de reconciliação
- Falha de cron
- Falha de banco
- Rate limit anormal
