# LGPD — Exportação e Solicitação de Exclusão

## Exportação de dados do tenant
- Endpoint: `GET /api/account/export`
- Acesso: apenas `owner` e `admin` do tenant autenticado.
- Retorna arquivo JSON com snapshot dos dados do tenant.
- Auditoria: `account.export.requested` e `account.export.generated`.

## Solicitação de exclusão
- Endpoint: `POST /api/account/delete-request`
- Acesso: apenas `owner` e `admin` do tenant autenticado.
- Não apaga dados automaticamente.
- Exige confirmação textual `EXCLUIR`.
- Auditoria: `account.deletion_requested` (sucesso) e `account.deletion_request.failed` (falha).

## Revisão operacional manual
1. Buscar eventos no `audit_logs` pelo `tenant_id` e ações `account.deletion_*`.
2. Confirmar identidade/autoridade do solicitante.
3. Validar obrigações legais e fiscais antes de qualquer exclusão física.
4. Não remover imediatamente dados financeiros (subscriptions/payments) quando houver obrigação de retenção.
5. Registrar decisão final em novo evento de auditoria operacional.
