# Final Production Readiness

## Domínios
- [ ] flipform.com.br aponta para landing
- [ ] www.flipform.com.br redireciona para flipform.com.br
- [ ] app.flipform.com.br aponta para app
- [ ] admin.flipform.com.br aponta para admin

## Vercel
- [ ] projeto `flipform` com app/admin
- [ ] projeto `flipform-landing` com landing/www
- [ ] envs production configuradas
- [ ] build production passa
- [ ] deploy sem cache testado

## Banco
- [ ] DATABASE_URL production configurada
- [ ] migrations aplicadas
- [ ] prisma generate ok
- [ ] backup validado
- [ ] restore drill validado em ambiente controlado

## Asaas
- [ ] ASAAS_BASE_URL production correta
- [ ] ASAAS_API_KEY production configurada
- [ ] webhook configurado no Asaas
- [ ] ASAAS_WEBHOOK_TOKEN bate com app
- [ ] eventos confirmados testados em sandbox

## E-mail
- [ ] EMAIL_PROVIDER production smtp/resend
- [ ] EMAIL_FROM atendimento@flipform.com.br
- [ ] SPF configurado
- [ ] DKIM configurado
- [ ] DMARC configurado
- [ ] teste real controlado enviado

## Segurança
- [ ] env:check production passa
- [ ] secrets não aparecem em logs
- [ ] readiness protegida
- [ ] admin exige platform role
- [ ] rate limit aplicado em rotas sensíveis

## Smoke
- [ ] npm run smoke:test passa em production/staging
- [ ] checkout starter/growth/pro carrega
- [ ] first-access responde corretamente
- [ ] health responde
- [ ] admin sem auth não vaza dados

## Relacionado
- [Audit Handoff](./audit-handoff.md)
- [Route Inventory](./route-inventory.md)
- [Environment Inventory](./environment-inventory.md)
