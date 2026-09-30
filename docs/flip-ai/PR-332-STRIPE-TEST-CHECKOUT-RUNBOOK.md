# PR 332 — Stripe Hosted Checkout em test mode

## Objetivo

Criar o primeiro Checkout hospedado da Stripe para uma recarga Flip AI, ainda sem liberar pagamento real e sem creditar a carteira.

O PR usa somente **test mode**.

## Fluxo

```
Super Admin
  -> cria recarga comercial pending
  -> solicita Checkout Stripe teste
Servidor
  -> carrega valor e créditos do banco
  -> reserva uma tentativa idempotente
  -> cria Checkout Session cs_test_...
Stripe Checkout hospedado
  -> pagamento de teste
  -> retorna ao Admin
FlipForm
  -> continua com a recarga pending
```

O retorno do navegador **não é confirmação de pagamento**.

A transição `pending -> paid` continua bloqueada para pedidos vinculados à Stripe e será responsabilidade do webhook assinado em um PR posterior.

## Autoridade de preço

O endpoint de Checkout recebe apenas:

- tenant pelo path;
- order ID pelo path;
- sessão autenticada do Platform Admin.

Ele não recebe pelo body:

- valor;
- moeda;
- quantidade de créditos;
- custo OpenAI.

O servidor lê esses dados diretamente de `flip_ai_top_up_orders`.

## Checkout hospedado

A sessão usa:

- `mode=payment`;
- `ui_mode=hosted`;
- `client_reference_id=<topUpOrderId>`;
- moeda BRL;
- uma linha com o valor comercial persistido no pedido;
- metadata com `tenantId`, `topUpOrderId` e propósito;
- a mesma metadata em `payment_intent_data`;
- cartão de teste como único método desta etapa.

PIX não é habilitado neste PR. A ativação de PIX dependerá da disponibilidade/capability da conta Stripe e terá gate próprio.

## Idempotência

Cada pedido mantém:

- `stripe_checkout_attempt`;
- `stripe_checkout_session_id`;
- timestamps da solicitação, criação e expiração.

A chave Stripe é:

```
flip-ai-top-up:<orderId>:checkout:<attempt>
```

Se duas requisições concorrentes ocorrerem antes de o session ID ser persistido, ambas usam a mesma idempotency key.

Se a API Stripe responder e a persistência falhar, o retry reutiliza a mesma tentativa.

## Validação da resposta Stripe

Antes de salvar a sessão o servidor exige:

- `livemode=false`;
- ID começando por `cs_test_`;
- sessão `open`;
- URL de Checkout presente;
- `client_reference_id` igual ao pedido;
- valor total igual ao valor persistido;
- moeda BRL.

Nenhuma divergência gera crédito.

## Migration

A migration é somente aditiva:

- 5 colunas novas em `flip_ai_top_up_orders`;
- CHECK de attempt não negativo;
- índice UNIQUE do Stripe Checkout Session ID.

Não há `DROP`, alteração de leads, billing Asaas, WhatsApp, Meta ou dados dos clientes.

A migration **não deve ser aplicada automaticamente em produção**. Depois do merge, deve passar pelo mesmo ensaio em branch temporária Neon usado no PR #330.

## Restricted API Key

Para testar o Checkout a conta Stripe precisa estar em test mode e a Restricted API Key precisa ter apenas as permissões necessárias para criar e consultar Checkout Sessions.

Não conceder permissões de refund, payout, transfer ou operações live.

A chave deve ser configurada exclusivamente no secret store do servidor:

```env
STRIPE_ENABLED=true
STRIPE_MODE=test
STRIPE_RESTRICTED_KEY=rk_test_...
STRIPE_LIVE_PAYMENTS_ALLOWED=false
```

Não envie a chave pelo chat e não a salve no banco.

## O que este PR não faz

- não processa webhook;
- não confia em success URL;
- não marca pedido como pago;
- não credita carteira;
- não habilita PIX;
- não habilita cartão live;
- não faz refund;
- não faz payout/transfer;
- não cria Customer;
- não altera assinatura Asaas.

## Próximo passo

PR #333: webhook Stripe assinado + verificação server-to-server + transição financeira idempotente, ainda em test mode.
