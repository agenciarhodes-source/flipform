# Security Review Checklist

- [ ] rotas admin exigem platform admin
- [ ] endpoints internos exigem secret
- [ ] webhook exige token
- [ ] tokens first-access são uso único
- [ ] tokens não aparecem em logs
- [ ] senha não aparece em logs
- [ ] secrets não aparecem em client
- [ ] rate limit em rotas sensíveis
- [ ] readiness protegida
- [ ] cookies/session revisados
- [ ] headers de segurança revisados
- [ ] Sentry não recebe secrets
- [ ] exportação LGPD não inclui hash/tokens
\n- Tenant Integrations/Pixels/GTM/GA4/Kanban tracking: implementado (ver tenant-integrations-tracking.md).
