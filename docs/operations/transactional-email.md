# Transactional Emails — FlipForm (produção)

## Objetivo
Garantir envio real do e-mail de ativação após pagamento confirmado, sem quebrar o webhook em caso de provider ausente.

## Variáveis de ambiente (Vercel)
Obrigatórias:
```env
EMAIL_PROVIDER=
EMAIL_FROM=atendimento@flipform.com.br
EMAIL_REPLY_TO=atendimento@flipform.com.br
```

### Opção A — SMTP
```env
EMAIL_PROVIDER=smtp
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
SMTP_SECURE=true
```

### Opção B — Resend
```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=
```

Outras relacionadas:
```env
NEXT_PUBLIC_APP_URL=https://app.flipform.com.br
NEXT_PUBLIC_MARKETING_URL=https://flipform.com.br
NEXT_PUBLIC_ADMIN_URL=https://admin.flipform.com.br
```

## Segurança
- Não enviar senha padrão por e-mail.
- Não enviar token fora do link seguro.
- Não logar token completo.
- Link de primeiro acesso deve usar `/first-access?token=...`.

## Template de ativação
Assunto: `SEU PLANO JÁ ESTÁ ATIVO NA FLIPFORM`

Conteúdo inclui:
- saudação
- confirmação de plano ativo
- link seguro para definir senha
- aviso de segurança (sem senha padrão)
- contato `atendimento@flipform.com.br`

## Comportamento de fallback
Quando provider não está configurado:
- webhook não falha
- envio é marcado como skipped
- log seguro: `Transactional email skipped: provider not configured`

## Auditoria
Eventos principais:
- `email.activation_send_attempted`
- `email.activation_sent`
- `email.activation_skipped_provider_missing`
- `email.activation_failed`

## Entregabilidade (DNS)
No domínio de e-mail, manter/configurar:
- SPF
- DKIM
- DMARC
- MX (quando aplicável)

Como o DNS está na Cloudflare, manter registros de e-mail lá e **não remover** registros da Hostinger sem plano de migração.


## Sandbox E2E
Para testes de ativação sem envio real, utilize `EMAIL_PROVIDER=none` e o runbook `docs/operations/asaas-sandbox-e2e-validation.md`.
