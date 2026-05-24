# Admin Operations — FlipForm

## Objetivo
Operar a plataforma FlipForm sem intervenção manual no banco.

## Acessos
- Admin URL: `https://admin.flipform.com.br`
- Rotas principais: `/admin`, `/admin/tenants`, `/admin/access`, `/admin/billing`, `/admin/audit`

## Operações
- Listar tenants e abrir detalhes por tenant.
- Criar tenant de cortesia (`/api/admin/tenants/courtesy`).
- Autorizar e-mail manualmente (`/api/admin/allowed-users`).
- Atualizar/bloquear acesso autorizado (`/api/admin/allowed-users/[id]`).
- Diagnosticar billing (`/api/admin/billing/diagnostics`).
- Rodar reconciliação manual (`/api/admin/billing/reconcile`).
- Suspender/reativar tenant (`/api/admin/tenants/[id]/status`).
- Alterar plano manualmente (`/api/admin/tenants/[id]/plan`).
- Consultar auditoria (`/api/admin/audit`).

## Regras de segurança
- Não exibir secrets.
- Não exibir tokens de first-access.
- Não exibir senha/hash.
- Não enviar senha padrão por e-mail.
- Toda ação crítica deve ser auditada.
- Toda ação crítica exige `platform_admin`.

## Playbooks
### Cliente pagou e não recebeu acesso
1. Abrir `/admin/billing`.
2. Buscar tenant e verificar divergências em diagnostics.
3. Rodar reconcile manual.
4. Verificar allowed users e status do tenant.

### Cliente não recebeu e-mail
1. Abrir `/admin/access` e confirmar e-mail/tenant.
2. Verificar auditoria de e-mail e first-access.
3. Reexecutar fluxo de acesso conforme política interna.

### Cliente precisa de cortesia
1. Criar tenant cortesia em `/api/admin/tenants/courtesy`.
2. Confirmar allowed user owner ativo.
3. Confirmar auditoria `courtesy.tenant.created`.

### Cliente vencido mas pagou
1. Executar diagnostics.
2. Rodar reconcile por `tenantId`.
3. Confirmar status local atualizado.

### Cliente pediu cancelamento
1. Verificar assinatura/status em billing.
2. Aplicar mudança de status adequada via admin status action.
3. Registrar motivo e confirmar auditoria.

### Cliente precisa trocar plano
1. Validar limites e plano alvo.
2. Alterar plano manualmente (quando permitido).
3. Registrar motivo e auditoria.

### Cliente bloqueado indevidamente
1. Verificar histórico de status e auditoria.
2. Reativar tenant se apropriado.
3. Confirmar acesso e status de usuários autorizados.

## Referência
- Ver também: .
