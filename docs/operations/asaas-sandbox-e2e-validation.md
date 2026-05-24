# Asaas Sandbox E2E Validation — FlipForm

## Objetivo
Validar o fluxo comercial completo em sandbox antes de habilitar venda real.

## Pré-requisitos
- `ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3`
- `ASAAS_API_KEY=`
- `ASAAS_WEBHOOK_TOKEN=`
- `EMAIL_PROVIDER=none`
- `NEXT_PUBLIC_APP_URL=https://app.flipform.com.br`
- `NEXT_PUBLIC_MARKETING_URL=https://flipform.com.br`

## Fluxo manual
1. Abrir `/checkout/growth`.
2. Preencher dados de teste.
3. Iniciar checkout.
4. Confirmar se cobrança/assinatura sandbox foi criada.
5. Simular webhook confirmado.
6. Verificar ativação de tenant/plano.
7. Verificar criação de first-access token.
8. Verificar envio de e-mail em modo `none` via auditoria.
9. Acessar `/first-access?token=...`.
10. Definir senha e acessar `/login`.

## Simulação de webhook
```bash
ASAAS_WEBHOOK_TOKEN='test-placeholder' \
WEBHOOK_URL='http://localhost:3000/api/webhooks/asaas' \
npm run asaas:webhook:simulate -- tests/fixtures/asaas/payment-confirmed.json
```

## Proteções
- Não usar produção por padrão.
- Não enviar e-mail real em teste.
- Não chamar Asaas produção em CI.
- Não logar token de first-access.
- Não logar secrets.

## Idempotência
Execute duas vezes a mesma fixture:

```bash
npm run asaas:webhook:simulate -- tests/fixtures/asaas/payment-confirmed.json
npm run asaas:webhook:simulate -- tests/fixtures/asaas/payment-confirmed.json
```

Resultado esperado:
- Sem duplicidade de ativação indevida.
- Sem múltiplos e-mails.
- Sem múltiplos tokens ativos desnecessários.


## Production environment lock
A validação de envs para produção está descrita em `docs/operations/production-env-checklist.md`.
