# Transactional Emails — FlipForm

## Variáveis de ambiente
```env
EMAIL_FROM=atendimento@flipform.com.br
EMAIL_REPLY_TO=atendimento@flipform.com.br
NEXT_PUBLIC_MARKETING_URL=https://flipform.com.br
NEXT_PUBLIC_APP_URL=https://app.flipform.com.br
NEXT_PUBLIC_ADMIN_URL=https://admin.flipform.com.br

# Provider futuro (opcional)
RESEND_API_KEY=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
```

## Templates disponíveis
- `plan_activated` — **SEU PLANO JÁ ESTÁ ATIVO NA FLIPFORM**
- `payment_received` — **Pagamento confirmado — FlipForm**
- `payment_pending` — **Pagamento pendente — FlipForm**
- `payment_overdue` — **Pagamento vencido — FlipForm**
- `subscription_canceled` — **Assinatura cancelada — FlipForm**
- `tenant_invite` — **Você foi convidado para acessar a FlipForm**
- `deletion_request_received` — **Solicitação de exclusão recebida — FlipForm**

## Helpers
- `renderEmailTemplate(templateName, params)` em `lib/email/render.ts`
- `sendTransactionalEmail(input)` em `lib/email/send.ts`

## Status de integração
- Base de templates pronta.
- Envio com provider real **não obrigatório** neste PR.
- Sem provider configurado, envio é `skipped` e não quebra fluxo principal.

## Auditoria
Eventos previstos:
- `email.transactional.queued`
- `email.transactional.sent`
- `email.transactional.skipped`
- `email.transactional.failed`

## DNS recomendado para entrega (futuro)
- Configurar SPF
- Configurar DKIM
- Configurar DMARC

## Providers sugeridos (futuro)
- Resend
- Postmark
- SendGrid
- SMTP transacional
