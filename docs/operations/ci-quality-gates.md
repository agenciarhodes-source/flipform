# CI Quality Gates — FlipForm

## Objetivo
Garantir que todo PR passe por uma esteira mínima de qualidade antes do merge.

## Gates obrigatórios
- `npm ci`
- `npx prisma generate`
- `npx prisma validate`
- `npm run typecheck`
- `npm run build`

## Variáveis fake usadas no CI
- `JWT_SECRET_CURRENT=staging-local-secret`
- `EMAIL_PROVIDER=none`
- `EMAIL_FROM=atendimento@flipform.com.br`
- `EMAIL_REPLY_TO=atendimento@flipform.com.br`
- `ASAAS_API_KEY=test-placeholder`
- `ASAAS_WEBHOOK_TOKEN=test-placeholder`
- `CRON_SECRET=test-placeholder`
- `INTERNAL_JOB_SECRET=test-placeholder`

## Regras
- Não usar secrets reais no CI.
- Não chamar Asaas real no CI.
- Não enviar e-mail real no CI.
- Não depender de banco de produção no CI.

## Regressões bloqueadas
- `@radix-ui/react-switch` não pode usar versão inexistente.
- `nodemailer` deve estar em `dependencies`.
- `useSearchParams` em páginas prerenderizadas deve estar dentro de `Suspense`.

## Validação local obrigatória
```bash
npm ci
npx prisma generate
npx prisma validate
npm run typecheck
JWT_SECRET_CURRENT='staging-local-secret' \
NEXT_PUBLIC_MARKETING_URL='https://flipform.com.br' \
NEXT_PUBLIC_APP_URL='https://app.flipform.com.br' \
NEXT_PUBLIC_ADMIN_URL='https://admin.flipform.com.br' \
APP_HOSTNAME='app.flipform.com.br' \
ADMIN_HOSTNAME='admin.flipform.com.br' \
EMAIL_PROVIDER='none' \
EMAIL_FROM='atendimento@flipform.com.br' \
EMAIL_REPLY_TO='atendimento@flipform.com.br' \
ASAAS_BASE_URL='https://sandbox.asaas.com/api/v3' \
ASAAS_API_KEY='test-placeholder' \
ASAAS_WEBHOOK_TOKEN='test-placeholder' \
CRON_SECRET='test-placeholder' \
INTERNAL_JOB_SECRET='test-placeholder' \
npm run build
```

Se possível sem serviços externos:
```bash
SMOKE_BASE_URL='http://localhost:3000' npm run smoke:test
```


## Referência de homologação
O fluxo E2E em sandbox com simulador de webhook está documentado em `docs/operations/asaas-sandbox-e2e-validation.md`.


## Production environment lock
Além dos quality gates, usar `npm run env:check` conforme `docs/operations/production-env-checklist.md`.
