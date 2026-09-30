# PR 330 — Fundação de recarga comercial da Carteira Flip AI

## Objetivo

Criar a base segura para comercializar créditos do Flip AI sem ativar ainda cobrança automática por PIX ou cartão.

O fluxo separa explicitamente três grandezas:

1. **valor comercial cobrado do cliente em BRL**;
2. **créditos concedidos ao tenant**;
3. **custo bruto estimado da OpenAI em USD**.

Nenhuma dessas grandezas é tratada como sinônimo das demais.

## Fluxo desta versão

Uma recarga comercial passa pelos estados:

```
pending -> paid -> credited
pending -> canceled
```

### pending

O pedido existe, mas nenhum pagamento foi confirmado e nenhum crédito foi adicionado.

### paid

O Super Admin registrou uma referência de pagamento confirmada.

Mesmo neste estado, a carteira ainda não recebe créditos.

### credited

Somente uma recarga já paga pode gerar um lançamento `credit` no ledger da Carteira Flip AI.

O lançamento usa:

```
idempotencyKey = top-up:<orderId>
source = top_up
referenceId = <orderId>
```

Assim, repetir a mesma ação não duplica o saldo.

### canceled

Somente pedidos pendentes podem ser cancelados nesta versão.

Pedidos pagos ou creditados não são cancelados automaticamente porque isso exigirá política própria de estorno financeiro e de créditos.

## Modelo de dados

Nova tabela:

`flip_ai_top_up_orders`

Principais campos:

- tenant;
- chave idempotente do pedido;
- status;
- valor comercial em centavos de BRL;
- quantidade de créditos;
- custo bruto estimado OpenAI em centavos de USD;
- provedor do pagamento;
- identificador do pagamento no provedor;
- forma de pagamento;
- datas de pagamento, crédito e cancelamento;
- ID do lançamento gerado no ledger;
- usuário que criou o pedido.

## Segurança multi-tenant

- todas as consultas e alterações exigem `tenant_id`;
- o pedido não pode ser operado através de outro tenant;
- o crédito usa o mesmo tenant do pedido;
- o ledger continua tenant-scoped;
- nenhum saldo é compartilhado entre clientes;
- nenhuma recarga pendente ou apenas criada altera saldo;
- nenhuma recarga não paga pode ser creditada;
- replay do crédito não duplica saldo.

## Interface

No Super Admin, dentro de:

`Clientes -> Cliente -> Carteira Flip AI`

foi adicionada a seção **Recargas comerciais**.

Nesta primeira versão o Super Admin pode:

- criar um pedido pendente;
- registrar manualmente uma referência de pagamento;
- creditar a carteira somente depois do pagamento;
- cancelar um pedido ainda pendente;
- consultar o histórico de pedidos.

## O que este PR não faz

- não cria cobrança no Asaas;
- não gera PIX;
- não coleta cartão;
- não armazena CVV;
- não executa auto-reload;
- não recebe ainda webhook de pagamento para recargas;
- não concede créditos automaticamente por evento externo;
- não altera o saldo operacional da OpenAI;
- não altera o billing da assinatura do FlipForm;
- não altera leads, Kanban, Meta, Google, WhatsApp, tracking ou integrações.

## Migration

A migration é **aditiva** e cria apenas a tabela de pedidos comerciais e seus índices/constraints.

Ela deve ser revisada e aplicada separadamente no Neon.

Este PR **não executa migrate deploy em produção**.

## Próxima etapa

Depois desta fundação estar validada, um PR posterior poderá integrar um gateway de pagamento para:

1. criar a cobrança;
2. receber webhook autenticado;
3. marcar o pedido como pago de forma idempotente;
4. creditar a carteira;
5. tratar estorno e chargeback com política explícita.

A integração futura deve reutilizar o mesmo pedido comercial em vez de criar um segundo sistema de saldo.
