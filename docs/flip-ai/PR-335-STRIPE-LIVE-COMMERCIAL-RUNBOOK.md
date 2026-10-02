# PR #335 — Stripe Live / Uso Comercial

## Objetivo

Permitir que a recarga comercial da Carteira Flip AI opere tanto em **Stripe test mode** quanto em **Stripe live mode**, mantendo o mesmo circuito seguro já validado:

```
Checkout hospedado
  -> pagamento Stripe
  -> webhook assinado
  -> validação server-to-server
  -> vínculo tenant + pedido + valor + moeda
  -> crédito idempotente
  -> ledger + audit log
```

O navegador continua sem autoridade para confirmar pagamento ou liberar créditos.

## Hard gate de produção

Pagamentos live só ficam disponíveis quando as três condições abaixo são verdadeiras ao mesmo tempo:

```env
STRIPE_ENABLED=true
STRIPE_MODE=live
STRIPE_LIVE_PAYMENTS_ALLOWED=true
```

Além disso:

- `STRIPE_RESTRICTED_KEY` precisa começar com `rk_live_`;
- `STRIPE_WEBHOOK_SECRET` precisa ser o signing secret do endpoint **live**;
- a sessão, o evento e o PaymentIntent precisam pertencer a `livemode=true`.

Qualquer mistura entre credenciais/objetos de teste e live é bloqueada.

## Restricted key LIVE

Criar uma Restricted API Key na conta Stripe de produção com o mínimo necessário:

- **Checkout Sessions → Escrever**
- **Payment Intents → Leitura**

Não usar secret key de acesso total no FlipForm.

## Webhook LIVE

Endpoint:

```
https://app.flipform.com.br/api/webhooks/stripe
```

Escopo: **Sua conta**.

Eventos:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

Usar o signing secret `whsec_...` gerado especificamente pelo endpoint live.

## Variáveis — produção

```env
STRIPE_ENABLED=true
STRIPE_MODE=live
STRIPE_RESTRICTED_KEY=rk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_LIVE_PAYMENTS_ALLOWED=true
```

As chaves devem existir somente como secrets de servidor na Vercel.

## Staging / testes

Staging deve continuar isolado em test mode:

```env
STRIPE_ENABLED=true
STRIPE_MODE=test
STRIPE_RESTRICTED_KEY=rk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_LIVE_PAYMENTS_ALLOWED=false
```

Nunca compartilhar o webhook secret entre test e live.

## Teste controlado antes da liberação comercial

Depois do deploy live:

1. validar a tela **Admin → Integrações → Stripe**;
2. confirmar `Modo produção`;
3. confirmar Checkout ativo;
4. confirmar Webhook financeiro ativo;
5. confirmar Uso comercial ativo;
6. criar uma recarga real de valor mínimo controlado;
7. concluir o pagamento;
8. verificar `provider_payment_id`, status `credited`, ledger e saldo;
9. confirmar que reenvio do webhook não duplica créditos;
10. confirmar retorno correto ao painel administrativo.

## Rollback

Para interromper novas cobranças live sem remover credenciais:

```env
STRIPE_LIVE_PAYMENTS_ALLOWED=false
```

e fazer redeploy.

Com o hard gate desligado:

- novos Checkouts live são bloqueados;
- o ambiente deixa de ser considerado pronto;
- credenciais permanecem armazenadas para investigação/rollback controlado.

Se necessário, também definir `STRIPE_ENABLED=false`.

## Fora do escopo deste PR

Este PR não adiciona:

- reembolso automático;
- payouts;
- transferências;
- Stripe Connect;
- edição de pagamentos;
- crédito baseado em retorno do navegador.

Essas operações permanecem fora da superfície permitida.
