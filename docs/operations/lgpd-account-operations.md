# LGPD Account Operations — FlipForm

## Objetivo
Documentar exportação, solicitação de exclusão e governança operacional LGPD para contas de clientes.

## Fluxos
1. Cliente solicita exportação (`GET /api/account/export`).
2. Cliente solicita exclusão (`POST /api/account/delete-request`).
3. Admin analisa solicitação (`/admin/lgpd`, `GET /api/admin/lgpd`).
4. Admin atualiza status (`PATCH /api/admin/lgpd`).
5. Admin registra observação interna auditável.

## Dados exportáveis
- Dados básicos do usuário autenticado (sem hash).
- Dados básicos do tenant.
- Formulários, leads, pipelines e configurações operacionais do tenant.
- Billing não sensível (status/valores/datas).
- Histórico de auditoria limitado ao tenant.

## Dados proibidos
- Secrets (`DATABASE_URL`, `JWT_SECRET`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `SMTP_PASSWORD`, `RESEND_API_KEY`).
- Tokens de sessão/first-access.
- Hash de senha.
- Payload bruto sensível de provedores.
- Cookies.

## Exclusão
A exclusão é solicitada e revisada; não há apagamento cego automático.
Avaliar antes de processar:
- obrigações legais;
- pendências financeiras;
- retenção mínima aplicável;
- trilha de auditoria necessária.

## Playbooks
- Cliente pediu exportação.
- Cliente pediu exclusão.
- Cliente pediu exclusão com assinatura ativa.
- Cliente pediu exclusão com pendência financeira.
- Admin processou solicitação por engano (abrir incidente e registrar reversão operacional).

## Revisão jurídica
Os textos legais e políticas devem ser revisados por assessoria jurídica antes do go-live público amplo.

## Referência
- Ver também: `docs/operations/observability-and-alerts.md`.
- Ver também: `docs/operations/incident-response.md`.
- Ver também: `docs/operations/observability-and-alerts.md`.
- Ver também: `docs/operations/incident-response.md`.
