# Production Readiness Checklist — FlipForm

> Objetivo: checklist operacional pré-go-live para venda real do FlipForm.
> 
> Escopo deste documento: operação, configuração, validação e rollback. Não adiciona novas features.

## 1) Domínios e roteamento

Domínios finais:
- `flipform.com.br` → landing externa / Emergent
- `www.flipform.com.br` → landing externa / Emergent
- `app.flipform.com.br` → sistema FlipForm (este projeto)
- `admin.flipform.com.br` → admin interno FlipForm (este projeto)

Checklist:
- [ ] Domínio marketing (`flipform.com.br`) apontado para projeto Emergent
- [ ] `www.flipform.com.br` apontado para landing
- [ ] `app.flipform.com.br` apontado para projeto Vercel do app
- [ ] `admin.flipform.com.br` apontado para projeto Vercel do app
- [ ] SSL ativo em todos os domínios
- [ ] Redirecionamentos testados
- [ ] `/` no app redireciona para `/login`
- [ ] `/admin` protegido e acessível apenas para perfil correto

---

## 2) Variáveis de ambiente (Production)

> **Não preencher com valores reais no repositório.**

```env
DATABASE_URL=
JWT_SECRET_CURRENT=
JWT_SECRET_PREVIOUS=
ASAAS_API_KEY=
ASAAS_WEBHOOK_TOKEN=
ASAAS_BASE_URL=
NEXT_PUBLIC_MARKETING_URL=https://flipform.com.br
NEXT_PUBLIC_APP_URL=https://app.flipform.com.br
NEXT_PUBLIC_ADMIN_URL=https://admin.flipform.com.br
APP_HOSTNAME=app.flipform.com.br
ADMIN_HOSTNAME=admin.flipform.com.br
EMAIL_FROM=atendimento@flipform.com.br
EMAIL_REPLY_TO=atendimento@flipform.com.br
SENTRY_DSN=
SENTRY_AUTH_TOKEN=
CRON_SECRET=
INTERNAL_JOB_SECRET=
```

Obrigatórias para produção:
- [ ] `DATABASE_URL`
- [ ] `JWT_SECRET_CURRENT`
- [ ] `ASAAS_API_KEY`
- [ ] `ASAAS_WEBHOOK_TOKEN`
- [ ] `ASAAS_BASE_URL`
- [ ] `NEXT_PUBLIC_APP_URL`
- [ ] `NEXT_PUBLIC_ADMIN_URL`
- [ ] `APP_HOSTNAME`
- [ ] `ADMIN_HOSTNAME`
- [ ] `CRON_SECRET`
- [ ] `INTERNAL_JOB_SECRET`

Recomendadas (fortemente):
- [ ] `NEXT_PUBLIC_MARKETING_URL`
- [ ] `EMAIL_FROM`
- [ ] `EMAIL_REPLY_TO`
- [ ] `SENTRY_DSN`
- [ ] `SENTRY_AUTH_TOKEN`

Rotação:
- [ ] `JWT_SECRET_PREVIOUS` definido somente em janela de rotação
- [ ] segredos revisados sem exposição em logs

---

## 3) Banco de dados e Prisma

Checklist:
- [ ] `DATABASE_URL` configurado em Production
- [ ] Migrations aplicadas com revisão
- [ ] `prisma generate` funcionando no pipeline
- [ ] Seed de planos aplicado
- [ ] Conexão de app com banco validada
- [ ] Backup configurado
- [ ] Restore testado em staging
- [ ] Sem `prisma db push` manual em produção sem change review

---

## 4) Asaas

Checklist:
- [ ] Conta Asaas de produção ativa
- [ ] `ASAAS_BASE_URL` de produção configurada
- [ ] `ASAAS_API_KEY` de produção configurada
- [ ] Webhook cadastrado no Asaas
- [ ] `ASAAS_WEBHOOK_TOKEN` salvo na Vercel
- [ ] Evento de pagamento confirmado testado
- [ ] Evento de assinatura cancelada testado
- [ ] Logs do webhook monitorados
- [ ] Idempotência validada

---

## 5) Billing

Checklist:
- [ ] Checkout starter funciona
- [ ] Checkout growth funciona
- [ ] Checkout pro funciona
- [ ] Enterprise não gera checkout self-service
- [ ] `payment_pending` não libera indevidamente
- [ ] `payment_confirmed/received` libera acesso
- [ ] `overdue` bloqueia/suspende conforme regra
- [ ] Cancelamento testado
- [ ] Troca de plano testada
- [ ] Reconciliation manual testada
- [ ] Cron/internal job protegido por secret

---

## 6) Auth e acesso

Checklist:
- [ ] Login funciona
- [ ] Logout funciona
- [ ] Onboarding funciona
- [ ] OTP funciona (se aplicável)
- [ ] Invite funciona (se aplicável)
- [ ] Tenant isolation validado
- [ ] Platform admin separado de tenant user
- [ ] `/admin` bloqueia usuário comum
- [ ] `admin.flipform.com.br` funciona
- [ ] **Known bug**: `/admin/access` (courtesy/manual provisioning) ainda exige diagnóstico dedicado se continuar falhando

---

## 7) Segurança

Checklist:
- [ ] `JWT_SECRET_CURRENT` forte
- [ ] `JWT_SECRET_PREVIOUS` usado apenas durante rotação
- [ ] Cookies seguros em produção
- [ ] CSP/headers verificados
- [ ] Sentry sem capturar secrets
- [ ] Rate limit ativo nas rotas críticas
- [ ] Endpoints internos protegidos por secret
- [ ] Webhooks validados por token
- [ ] Secrets não logados
- [ ] Backups fora do Git

---

## 8) E-mail transacional

Checklist:
- [ ] Domínio `flipform.com.br` preparado para e-mail
- [ ] `atendimento@flipform.com.br` criado
- [ ] SPF configurado
- [ ] DKIM configurado
- [ ] DMARC configurado
- [ ] Provider transacional escolhido
- [ ] Templates revisados
- [ ] Envio de plano ativo testado
- [ ] Envio de pagamento confirmado testado
- [ ] Envio de cancelamento testado

---

## 9) Observability

Checklist:
- [ ] `SENTRY_DSN` configurado
- [ ] Erros de API capturados
- [ ] Erros de webhook capturados
- [ ] Source maps configurados (se aplicável)
- [ ] Logs Vercel monitorados
- [ ] Alertas mínimos definidos (API 5xx, webhook falhas, auth spikes)

---

## 10) Smoke tests manuais (go-live)

Sequência recomendada:
1. Abrir `https://app.flipform.com.br/login`
2. Criar checkout starter
3. Pagar / testar confirmação no Asaas
4. Validar webhook
5. Validar login/onboarding
6. Criar formulário
7. Enviar lead por formulário público
8. Mover lead no pipeline
9. Exportar dados LGPD
10. Trocar plano
11. Cancelar assinatura
12. Acessar admin
13. Rodar billing diagnostics
14. Verificar Sentry/logs

---

## 11) Rollback

Checklist de rollback:
- [ ] Rollback de deploy Vercel documentado
- [ ] Rollback de variáveis de ambiente preparado
- [ ] Rollback de webhook (endpoint/token) planejado
- [ ] Backup antes de migration
- [ ] Restore em staging testado antes de produção
- [ ] Congelar deploys durante incidente crítico

---

## 12) Known Issues / Deferred

- `/admin/access` (courtesy/manual provisioning) precisa de diagnóstico real se continuar falhando.
- Landing pública será mantida fora deste projeto (Emergent).
- Envio real de e-mail depende de provider transacional configurado.
- Senha padrão não deve ser enviada por e-mail.
- Enterprise permanece com fluxo comercial/manual.
- Testes E2E automatizados ainda pendentes.

---

## Aprovação final de go-live

- [ ] Checklist revisada por produto
- [ ] Checklist revisada por engenharia
- [ ] Checklist revisada por operação/suporte
- [ ] Janela de deploy aprovada
- [ ] Responsáveis de plantão definidos
