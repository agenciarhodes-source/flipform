# FlipForm — Funil pós-checkout e ativação

Fluxo oficial:

Landing → Checkout no app → Pagamento via Asaas → Página pós-checkout (success/pending/cancelled/error) → Webhook confirma pagamento → Tenant/plano ativado → E-mail de ativação enviado → First access seguro → Login

## Regras de segurança
- Não enviar senha padrão por e-mail.
- Usar link seguro de primeiro acesso.
- Não expor token em logs.
- Não aceitar token expirado.
- Não permitir reutilização de token já usado.

## Idempotência webhook
- Eventos de webhook da Asaas devem ser idempotentes.
- Eventos duplicados não devem gerar múltiplos e-mails de ativação.
- Eventos duplicados não devem gerar múltiplos tokens para o mesmo pagamento confirmado.

## Páginas públicas pós-checkout
- `/checkout/success`
- `/checkout/pending`
- `/checkout/cancelled`
- `/checkout/error`

Todas devem manter comunicação clara: ativação depende da confirmação de pagamento.


## Pós-checkout
Após pagamento confirmado via Asaas, o usuário recebe e-mail transacional com link seguro de primeiro acesso.


## Sandbox E2E
Consulte também: `docs/operations/asaas-sandbox-e2e-validation.md` para validação assistida com simulador de webhook.

## Referência
- Ver também: `docs/operations/billing-lifecycle.md`.

## Referência
- Ver também: `docs/operations/first-access-onboarding.md`.
