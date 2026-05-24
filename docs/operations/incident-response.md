# Incident Response — FlipForm

## Playbooks

### Cliente pagou e não recebeu acesso
- Verificar `/api/admin/billing/diagnostics` e webhook recente.
- Rodar reconcile manual.
- Mitigar: reativar tenant/allowed user quando aplicável.

### Webhook Asaas falhou
- Verificar token/config/env e eventos recentes.
- Confirmar idempotência e status local/provider.

### E-mail transacional falhou
- Validar provider (`none|smtp|resend`) e envs.
- Verificar falhas de envio e auditoria de e-mail.

### Checkout com erro
- Validar payload e resposta da rota pública.
- Checar logs estruturados e Sentry.

### Admin indisponível
- Verificar host routing (`admin.flipform.com.br`) e sessão platform admin.

### Banco indisponível
- Usar readiness para confirmar falha de `database`.
- Mitigar: modo degradado e comunicação.

### Cron/reconciliação falhou
- Verificar secrets internos e logs de job.

### Sentry com pico de erros
- Filtrar por rota e deploy recente.
- Aplicar rollback parcial/feature flag operacional quando necessário.

### Env de produção ausente/incorreta
- Executar `npm run env:check` e corrigir painel Vercel.

## Comunicação
- Registrar impacto, escopo, ETA de mitigação e atualização ao cliente.
