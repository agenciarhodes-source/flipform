# Environment Inventory

> Nunca expor secrets no client e nunca commitar valores reais.

| Env | Obrigatória | Ambiente | Pública | Client? | Valor esperado | Risco se ausente | Uso |
|---|---|---|---|---|---|---|---|
| NEXT_PUBLIC_MARKETING_URL | sim | all | sim | sim | https URL | links incorretos | public urls |
| NEXT_PUBLIC_APP_URL | sim | all | sim | sim | https URL | fluxo quebrado | auth/checkout |
| NEXT_PUBLIC_ADMIN_URL | sim | all | sim | sim | https URL | links admin quebrados | routing/docs |
| APP_HOSTNAME | sim | prod | não | não | hostname | host mismatch | middleware |
| ADMIN_HOSTNAME | sim | prod | não | não | hostname | admin routing falha | middleware |
| DATABASE_URL | sim | all | não | não | DSN db | app indisponível | prisma/db |
| JWT_SECRET_CURRENT | sim | all | não | não | secret | auth inválida | jwt/auth |
| JWT_SECRET_PREVIOUS | opcional | prod | não | não | secret | rotação difícil | jwt |
| ASAAS_BASE_URL | sim | all | não | não | sandbox/prod url | billing falha | asaas client |
| ASAAS_API_KEY | sim | all | não | não | secret | integração falha | asaas api |
| ASAAS_WEBHOOK_TOKEN | sim | all | não | não | secret | webhook inseguro | webhook verify |
| EMAIL_PROVIDER | sim | all | não | não | none/smtp/resend | e-mail inconsistente | send.ts |
| EMAIL_FROM | sim | all | não | não | sender | entregabilidade | email |
| EMAIL_REPLY_TO | sim | all | não | não | email | suporte falha | email |
| SMTP_HOST/PORT/USER/PASSWORD/SECURE | condicional | prod | não | não | smtp cfg | envio falha | email smtp |
| RESEND_API_KEY | condicional | prod | não | não | secret | envio falha | email resend |
| CRON_SECRET | sim | prod | não | não | secret | jobs expostos | cron/internal |
| INTERNAL_JOB_SECRET | sim | prod | não | não | secret | readiness/job exposto | readiness/jobs |
| SENTRY_DSN | recomendada | prod | não | não | dsn | baixa observabilidade | sentry server |
| NEXT_PUBLIC_SENTRY_DSN | opcional | prod | sim | sim | dsn public | sem erro client | sentry client |
| SENTRY_ORG/PROJECT/AUTH_TOKEN | opcional | ci/prod | não | não | sentry cfg | upload sourcemap falha | sentry build |
| ALLOW_EMAIL_PROVIDER_NONE_IN_PRODUCTION | opcional | prod | não | não | true/false | envio acidentalmente desligado | guardrail |
| ALLOW_SANDBOX_ASAAS_IN_PRODUCTION | opcional | prod | não | não | true/false | ambiente errado | guardrail |
| ALLOW_PRODUCTION_RESTORE | opcional | prod | não | não | true/false | restore bloqueado | db-restore |
