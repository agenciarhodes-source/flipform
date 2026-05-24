# Audit Handoff

## Auditoria técnica
- **Revisar:** build, typecheck, CI, smoke, rotas críticas, erros 500, performance básica.
- **Arquivos:** `.github/workflows/ci.yml`, `scripts/smoke-test.ts`, `next.config.js`.
- **Rotas:** `/`, `/checkout/*`, `/api/health`.
- **Comandos:** `npm run typecheck`, `npm run build`, `npm run smoke:test`.
- **Aprovação:** sem 500, sem stack trace e gates verdes.

## Auditoria segurança
- **Revisar:** auth, RBAC admin, secrets, rate limit, headers, Sentry/logs, first-access token, webhook token.
- **Arquivos:** `lib/auth.ts`, `lib/rate-limit.ts`, `lib/observability.ts`, `middleware.ts`.
- **Rotas:** `/api/admin/*`, `/api/webhooks/asaas`, `/api/health/readiness`.
- **Comandos:** `npm run env:check`, regression guards.
- **Aprovação:** rotas protegidas, sem secrets/client leaks.

## Auditoria billing/financeira
- **Revisar:** checkout, Asaas, webhook, idempotência, planos, cancelamento, upgrade/downgrade, inadimplência, reconciliação.
- **Arquivos:** `app/api/public/checkout/route.ts`, `app/api/webhooks/asaas/route.ts`, `lib/billing-*.ts`.
- **Rotas:** `/api/public/checkout`, `/api/webhooks/asaas`, `/api/admin/billing/*`.
- **Comandos:** smoke + simulação sandbox.
- **Aprovação:** status coerentes local/provider e reconciliação auditável.

## Auditoria LGPD
- **Revisar:** privacy, terms, exportação, exclusão, admin LGPD, retenção.
- **Arquivos:** `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/api/account/*`, `app/api/admin/lgpd/route.ts`.
- **Rotas:** `/privacy`, `/terms`, `/api/account/export`, `/api/account/delete-request`.
- **Comandos:** smoke e revisão de payloads sem segredos.
- **Aprovação:** fluxo LGPD funcional e sem dados proibidos.

## Auditoria operacional
- **Revisar:** backup, restore, incident response, observability, runbooks, admin operations.
- **Arquivos:** `scripts/db-backup.sh`, `scripts/db-restore.sh`, `docs/operations/*`.
- **Rotas:** `/api/health`, `/api/health/readiness`, `/api/internal/*`.
- **Comandos:** `npm run data:safety-check`, `bash -n scripts/db-*.sh`.
- **Aprovação:** procedimentos executáveis e documentação íntegra.
