# Production Environment Checklist — FlipForm

## Objetivo
Documentar as variáveis necessárias para produção do projeto **flipform** e evitar deploy com configuração incompleta.

## Projeto Vercel
Project: `flipform`  
Domains:
- `app.flipform.com.br`
- `admin.flipform.com.br`

## Domínios externos
Landing:
- `flipform.com.br`
- `www.flipform.com.br`

App:
- `app.flipform.com.br`

Admin:
- `admin.flipform.com.br`

## Envs obrigatórias na Vercel

### Públicas
- `NEXT_PUBLIC_MARKETING_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_ADMIN_URL`
- `NEXT_PUBLIC_SENTRY_DSN` (opcional)

### Privadas obrigatórias
- `APP_HOSTNAME`
- `ADMIN_HOSTNAME`
- `DATABASE_URL`
- `JWT_SECRET_CURRENT`
- `ASAAS_BASE_URL`
- `ASAAS_API_KEY`
- `ASAAS_WEBHOOK_TOKEN`
- `EMAIL_PROVIDER`
- `EMAIL_FROM`
- `EMAIL_REPLY_TO`
- `CRON_SECRET`
- `INTERNAL_JOB_SECRET`

### Obrigatórias por provider
Se `EMAIL_PROVIDER=smtp`:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_SECURE`

Se `EMAIL_PROVIDER=resend`:
- `RESEND_API_KEY`

### Opcionais
- `JWT_SECRET_PREVIOUS`
- `SENTRY_DSN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_AUTH_TOKEN`
- `ALLOW_EMAIL_PROVIDER_NONE_IN_PRODUCTION`
- `ALLOW_SANDBOX_ASAAS_IN_PRODUCTION`

### Nunca expor no client
- `DATABASE_URL`
- `ASAAS_API_KEY`
- `ASAAS_WEBHOOK_TOKEN`
- `SMTP_PASSWORD`
- `RESEND_API_KEY`
- `CRON_SECRET`
- `INTERNAL_JOB_SECRET`
- `SENTRY_AUTH_TOKEN`

## Valores esperados em produção
- `NEXT_PUBLIC_MARKETING_URL=https://flipform.com.br`
- `NEXT_PUBLIC_APP_URL=https://app.flipform.com.br`
- `NEXT_PUBLIC_ADMIN_URL=https://admin.flipform.com.br`
- `APP_HOSTNAME=app.flipform.com.br`
- `ADMIN_HOSTNAME=admin.flipform.com.br`
- `ASAAS_BASE_URL=https://api.asaas.com/v3`
- `EMAIL_FROM=atendimento@flipform.com.br`
- `EMAIL_REPLY_TO=atendimento@flipform.com.br`

## Checklist Vercel
Vercel → Project `flipform` → Settings → Environment Variables

Ambientes:
- Production
- Preview
- Development (se necessário)

Checklist:
- [ ] adicionar envs públicas
- [ ] adicionar `DATABASE_URL`
- [ ] adicionar `JWT_SECRET_CURRENT`
- [ ] adicionar `JWT_SECRET_PREVIOUS`, se houver rotação
- [ ] adicionar `ASAAS_BASE_URL` produção
- [ ] adicionar `ASAAS_API_KEY` produção
- [ ] adicionar `ASAAS_WEBHOOK_TOKEN` produção
- [ ] configurar `EMAIL_PROVIDER`
- [ ] configurar SMTP ou Resend
- [ ] configurar `CRON_SECRET`
- [ ] configurar `INTERNAL_JOB_SECRET`
- [ ] configurar Sentry, se aplicável
- [ ] redeploy sem cache, se necessário
- [ ] rodar health/config, se implementado
- [ ] rodar smoke pós-deploy

## Comandos de validação
```bash
npm install
npx prisma generate
npx prisma validate
npm run typecheck
npm run env:check
NODE_ENV=production VERCEL_ENV=production npm run env:check
JWT_SECRET_CURRENT='staging-local-secret' npm run build
```

## Smoke pós-deploy
```bash
SMOKE_BASE_URL='https://app.flipform.com.br' npm run smoke:test
```

## Segurança
Não commitar .env real.  
Não expor DATABASE_URL.  
Não expor ASAAS_API_KEY.  
Não expor ASAAS_WEBHOOK_TOKEN.  
Não expor SMTP_PASSWORD.  
Não expor RESEND_API_KEY.  
Não usar EMAIL_PROVIDER=none em produção, exceto em manutenção controlada.  
Não usar sandbox Asaas em produção, exceto com flag explícita e temporária.

## Referência
- Ver também: `docs/operations/billing-lifecycle.md`.

## Referência
- Ver também: `docs/operations/first-access-onboarding.md`.

## Referência
- Ver também: `docs/operations/observability-and-alerts.md`.
- Ver também: `docs/operations/incident-response.md`.

## Referência
- Ver também: `docs/operations/observability-and-alerts.md`.
- Ver também: `docs/operations/incident-response.md`.

## Referência
- Ver também: `docs/operations/observability-and-alerts.md`.
- Ver também: `docs/operations/incident-response.md`.
- Ver também: `docs/operations/observability-and-alerts.md`.
- Ver também: `docs/operations/incident-response.md`.
