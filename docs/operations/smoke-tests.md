# Smoke Tests — Critical Flows

## Objetivo
Validar rapidamente rotas e APIs críticas sem depender de cobrança real, secrets reais ou dados de produção.

## Script
- Arquivo: `scripts/smoke-test.ts`
- Comando: `npm run smoke:test`

## Variáveis de ambiente
```env
SMOKE_BASE_URL=http://localhost:3000
SMOKE_ADMIN_EMAIL=
SMOKE_ADMIN_PASSWORD=
SMOKE_TEST_EMAIL=
SMOKE_SKIP_AUTH=true
```

## Como rodar local
1. `npm run build`
2. `npm run start`
3. Em outro terminal: `SMOKE_BASE_URL=http://localhost:3000 npm run smoke:test`

## Como rodar em preview
```bash
SMOKE_BASE_URL=https://<preview-url> npm run smoke:test
```

## Cobertura atual
Páginas:
- `/`
- `/login`
- `/checkout/starter`
- `/checkout/growth`
- `/checkout/pro`
- `/legal/terms`
- `/legal/privacy`
- `/legal/cancellation`
- `/legal/support`

APIs (JSON safety + auth/control errors):
- `POST /api/public/checkout` (enterprise / invalid-plan)
- `POST /api/billing/change-plan` (sem auth)
- `POST /api/billing/cancel` (sem auth)
- `GET /api/account/export` (sem auth)
- `POST /api/account/delete-request` (sem auth)
- `GET /api/admin/allowed-users` (sem auth)
- `GET /api/admin/billing/diagnostics` (sem auth)
- `POST /api/webhooks/asaas` (sem token)

## Limitações
- Não testa pagamento real no Asaas.
- Não testa casos autenticados com usuário real neste baseline.
- Não substitui E2E completo de negócio.

## Interpretação
Saída padrão:
- `PASS /rota ...`
- `FAIL /rota ...`

Resumo final:
- `Smoke tests completed: X passed, Y failed`

Se houver qualquer falha, o processo retorna código `1`.
