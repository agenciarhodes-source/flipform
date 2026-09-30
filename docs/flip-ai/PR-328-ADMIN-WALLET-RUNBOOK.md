# PR #328 — Carteira administrável por tenant

## Regra central

Cada tenant possui uma carteira Flip AI exclusiva.

Exemplo:

- Cliente A recebe 100.000 créditos.
- Cliente B recebe 50.000 créditos.
- A plataforma possui 150.000 créditos distribuídos, mas não existe um saldo compartilhado entre A e B.
- Se A consumir seus 100.000 créditos, nenhuma operação de A pode debitar os 50.000 créditos de B.

Toda leitura, crédito e débito da carteira continua vinculada ao `tenant_id` da própria operação.

## Administração

Somente `platform_admin` pode conceder créditos manualmente.

Cada concessão exige:

- quantidade inteira e positiva;
- motivo;
- identificador idempotente informado pelo administrador.

O identificador é persistido no ledger como `platform-admin:<identificador>`. Repetir a mesma operação com os mesmos dados reutiliza o lançamento existente em vez de criar novo crédito.

## Auditoria

A concessão administrativa:

- cria um lançamento append-only em `flip_ai_credit_ledger`;
- registra o ator no `audit_logs`;
- registra quantidade, motivo, identificador e saldo resultante;
- não edita lançamentos históricos.

O ledger e o audit log são gravados na mesma transação.

## Interface

O Super Admin pode abrir o cliente em `/admin/tenants/:id` e acessar a aba **Carteira Flip AI** para:

- consultar saldo atual;
- consultar entradas acumuladas;
- consultar consumo acumulado;
- adicionar créditos;
- consultar os últimos 100 lançamentos.

A interface informa explicitamente que o saldo é exclusivo daquele tenant.

Na tela do cliente, o texto diferencia a **Carteira Flip AI** do saldo operacional da OpenAI.

## Fora de escopo

Este PR não adiciona:

- recarga automática;
- cartão ou PIX;
- gateway de pagamento;
- mudança em leads;
- mudança em Meta, Google, WhatsApp ou tracking;
- migration nova.

A política de saldo insuficiente continua a mesma do PR #327: a carteira nunca fica negativa e nunca usa saldo de outro tenant.
