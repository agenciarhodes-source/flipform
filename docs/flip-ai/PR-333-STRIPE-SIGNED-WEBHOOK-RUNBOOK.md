# PR 333 — Stripe signed webhook + crédito automático

## Objetivo

Fechar o circuito financeiro das recargas Flip AI em **Stripe test mode**:

```
Checkout hospedado
  -> pagamento de teste
  -> webhook assinado
  -> verificação server-to-server
  -> pedido confirmado
  -> crédito idempotente na carteira do tenant
```

O navegador, a success URL e parâmetros de query **não têm autoridade financeira**.

## Eventos aceitos

O processador financeiro atua somente em:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

Outros eventos assinados recebem `200` e são ignorados.

## Verificação em duas camadas

1. A rota valida `Stripe-Signature` com `STRIPE_WEBHOOK_SECRET` e o corpo bruto.
2. Depois da assinatura, o servidor consulta novamente a Stripe:
   - Checkout Session;
   - PaymentIntent.

Antes de creditar, exige:

- `livemode=false`;
- Checkout `cs_test_...`;
- `mode=payment`;
- sessão `complete`;
- `payment_status=paid`;
- PaymentIntent `succeeded`;
- tenant, order ID e propósito iguais na metadata;
- `client_reference_id` igual ao order ID;
- valor e moeda iguais ao pedido persistido;
- Checkout Session igual à registrada no pedido.

## Idempotência e concorrência

- `webhook_events(provider,event_id)` evita replay do mesmo evento.
- O pedido é bloqueado com `FOR UPDATE`.
- O ledger usa a chave `top-up:<orderId>`.
- Eventos concorrentes ou repetidos não podem duplicar créditos.
- O pagamento, ledger, status `credited`, auditoria e `processed_at` são concluídos na mesma transação.

## Dados sensíveis

O FlipForm não persiste o payload financeiro completo da Stripe no `webhook_events`.
São guardados apenas identificadores operacionais mínimos:

- event ID/type;
- Checkout Session ID;
- PaymentIntent ID;
- tenant;
- indicação de test mode.

Dados de cartão não entram no FlipForm.

## Variáveis

```env
STRIPE_ENABLED=true
STRIPE_MODE=test
STRIPE_RESTRICTED_KEY=rk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_LIVE_PAYMENTS_ALLOWED=false
```

A Restricted API Key precisa somente das permissões necessárias para:

- criar/ler Checkout Sessions;
- ler PaymentIntents.

Não conceder refund, payout, transfer ou permissões live nesta etapa.

## Segurança

- assinatura obrigatória;
- raw body obrigatório;
- limite de payload;
- rate limit;
- live mode bloqueado;
- tenant binding;
- amount/currency binding;
- session binding;
- PaymentIntent binding;
- replay protection;
- ledger idempotente;
- sem confiança no browser;
- sem retry automático financeiro ambíguo.

## Produção

Este PR permanece em **test mode**.

Antes de live:

1. aplicar e validar migration do PR 332 em produção;
2. configurar webhook endpoint Stripe;
3. cadastrar o `whsec_...` no secret store;
4. executar pagamento de teste end-to-end;
5. validar crédito único;
6. testar replay do mesmo evento;
7. testar valor/tenant/session adulterados;
8. auditar logs;
9. somente depois discutir live mode, refunds/disputes e PIX.
