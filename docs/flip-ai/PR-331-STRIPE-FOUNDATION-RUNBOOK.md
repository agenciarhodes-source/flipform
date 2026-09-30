# PR 331 — Stripe Foundation

## Objetivo

Preparar a integração financeira da Carteira Flip AI usando Stripe com uma base segura, observável e **somente em modo de teste**.

Este PR não cria cobrança, não gera Checkout, não recebe webhook financeiro e não movimenta dinheiro.

## Dependência oficial

O servidor usa o SDK oficial `stripe-node`, fixado em:

```
stripe 22.6.2
```

A versão fica pinada para evitar atualização automática de uma dependência financeira crítica sem revisão.

## Variáveis

```env
STRIPE_ENABLED=false
STRIPE_MODE=test
STRIPE_RESTRICTED_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_LIVE_PAYMENTS_ALLOWED=false
```

### STRIPE_RESTRICTED_KEY

A integração foi desenhada para usar uma **Restricted API Key**, nunca uma secret key ampla.

No PR #331 somente chaves de teste com prefixo `rk_test_` são aceitas.

A chave nunca deve:

- ser enviada pelo chat;
- ser commitada;
- ser colocada em variável `NEXT_PUBLIC_*`;
- aparecer em logs;
- ser salva no banco do FlipForm;
- ser exibida pelo painel administrativo.

### STRIPE_WEBHOOK_SECRET

É opcional nesta etapa. Será obrigatório quando o endpoint assinado de webhook for implementado.

Quando configurado, deve ter prefixo `whsec_`.

## Hard gate de live mode

O código define:

```
STRIPE_FOUNDATION_LIVE_PAYMENTS_ALLOWED = false
```

Além disso, o validador de ambiente exige:

```
STRIPE_MODE=test
STRIPE_LIVE_PAYMENTS_ALLOWED=false
STRIPE_RESTRICTED_KEY=rk_test_...
```

Portanto, adicionar acidentalmente uma `rk_live_` não torna o PR #331 apto para pagamentos reais.

## SDK

O cliente Stripe:

- existe somente no servidor;
- não é importado pelo navegador;
- usa timeout limitado;
- desativa retries automáticos nesta fundação;
- desativa telemetria do SDK;
- não faz chamadas financeiras neste PR.

## Readiness

O Super Admin recebe um diagnóstico somente-leitura em:

```
/api/admin/integrations/stripe/readiness
```

A tela **Integrações da Plataforma** exibe:

- integração habilitada/desabilitada;
- modo test/live;
- existência e tipo da restricted key sem revelar seu valor;
- preparação do webhook secret;
- versão do SDK;
- bloqueio de Checkout;
- bloqueio de webhook financeiro;
- bloqueio de movimentação de dinheiro;
- bloqueio de live payments.

## Configuração recomendada da conta Stripe

Antes de qualquer pagamento real:

1. ativar MFA/passkey para administradores da Stripe;
2. trabalhar primeiro em test mode;
3. criar uma Restricted API Key exclusiva para o FlipForm;
4. conceder somente as permissões que os próximos PRs realmente usarem;
5. manter ambientes test e live com chaves distintas;
6. guardar secrets apenas no secret store da infraestrutura;
7. planejar rotação e resposta a comprometimento.

As permissões definitivas da Restricted API Key serão definidas no PR que criar Checkout, porque conceder permissões antecipadamente viola o princípio de menor privilégio.

## Fora do escopo

Este PR não:

- cria Checkout Session;
- cria PaymentIntent;
- ativa Pix;
- coleta cartão;
- cria refund;
- cria payout;
- cria transfer;
- credita Carteira Flip AI;
- processa webhook;
- altera `flip_ai_top_up_orders`;
- altera migrations;
- altera billing Asaas existente;
- altera leads, Kanban, WhatsApp, Meta ou Google.

## Próximo PR

O próximo passo poderá implementar o **Checkout hospedado em test mode**.

O preço e a quantidade de créditos deverão ser resolvidos no servidor. O navegador nunca poderá determinar livremente o valor financeiro de uma recarga.
