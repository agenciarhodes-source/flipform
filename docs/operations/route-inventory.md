# Route Inventory

## Públicas
| Rota | Tipo | Auth | Rate limit | Risco | Observabilidade | Smoke |
|---|---|---|---|---|---|---|
| `/` `/login` `/pricing` | page | não | não | baixo | básico | sim |
| `/checkout/*` | page | não | indireto | médio | checkout/webhook | sim |
| `/first-access` | page | token | sim | alto | audit + logs | sim |
| `/privacy` `/terms` | page | não | não | baixo | básico | sim |
| `/api/health` | api | não | não | baixo | health log | sim |
| `/api/public/checkout` | api | não | sim | alto | observability | sim |

## Cliente autenticado
| Rota | Tipo | Auth | Rate limit | Risco | Observabilidade | Smoke |
|---|---|---|---|---|---|---|
| `/account` `/billing` | page | sessão | n/a | médio | audit parcial | sim |
| `/api/account/export` | api | sessão | sim | alto | audit | sim |
| `/api/account/delete-request` | api | sessão | sim | alto | audit | sim |
| `/api/billing/change-plan` `/api/billing/cancel` | api | sessão | sim | alto | audit | sim |

## Admin
| Rota | Tipo | Auth | Rate limit | Risco | Observabilidade | Smoke |
|---|---|---|---|---|---|---|
| `/admin` `/admin/access` `/admin/billing` `/admin/lgpd` | page | platform admin | n/a | alto | audit/log | sim |
| `/api/admin/*` | api | platform admin | sim em ações críticas | alto | audit + route error | sim (sem auth) |

## Internas/protegidas
| Rota | Tipo | Auth | Rate limit | Risco | Observabilidade | Smoke |
|---|---|---|---|---|---|---|
| `/api/webhooks/asaas` | api | webhook token | sim | alto | webhook audit | sim (sem token) |
| `/api/internal/*` | api | secret | sim | alto | job logs | parcial |
| `/api/health/readiness` | api | x-internal-secret | não | médio | readiness checks | sim (sem secret) |
| `/api/admin/billing/reconcile` | api | platform admin | sim | alto | billing audit | sim (sem auth) |
\n- Tenant Integrations/Pixels/GTM/GA4/Kanban tracking: implementado (ver tenant-integrations-tracking.md).
