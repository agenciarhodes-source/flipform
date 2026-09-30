# PR 329 — Observabilidade da conta OpenAI

## Objetivo

Adicionar ao Super Admin do FlipForm uma visão **somente leitura** dos custos e da utilização da organização OpenAI usada pela plataforma.

Esta área é operacional e global. Ela **não representa** a Carteira Flip AI de nenhum tenant.

## Fontes oficiais

O painel usa exclusivamente endpoints administrativos documentados pela OpenAI:

- `GET /v1/organization/costs`;
- `GET /v1/organization/usage/completions`;
- `GET /v1/organization/usage/embeddings`.

A autenticação usa uma **Admin API key** da organização, mantida somente no servidor.

## Variáveis de ambiente

Obrigatória para habilitar o painel:

```env
OPENAI_ADMIN_KEY=
```

Opcionais:

```env
OPENAI_ORGANIZATION_ID=
OPENAI_OPERATIONAL_BALANCE_USD=
```

### OPENAI_OPERATIONAL_BALANCE_USD

Não existe neste PR uma tentativa de ler o saldo pré-pago restante por endpoint não documentado.

Se o Super Admin quiser uma projeção de duração do caixa operacional, pode informar manualmente uma referência em USD através de `OPENAI_OPERATIONAL_BALANCE_USD`.

Esse valor:

- é exibido como **Saldo operacional estimado**;
- nunca é chamado de saldo oficial da OpenAI;
- é dividido pela média diária oficial de custos para gerar uma projeção aproximada;
- não altera billing, cartões, recarga automática ou carteira de tenant.

## Segurança

- rota protegida por `withPlatformAdmin`;
- `OPENAI_ADMIN_KEY` nunca é serializada na resposta;
- nenhuma credencial é armazenada no banco;
- nenhuma migration;
- nenhum write na OpenAI;
- nenhum write no banco do FlipForm;
- nenhuma alteração em leads, pipelines, conversas, WhatsApp, Meta, Google ou tracking;
- nenhuma mistura entre o caixa operacional da OpenAI e a Carteira Flip AI de clientes.

## Interface

Nova área:

`/admin/openai`

Exibe:

- custo total do período;
- média diária;
- saldo operacional manual, quando configurado;
- projeção aproximada de dias;
- uso por modelo;
- quantidade de requisições e tokens;
- custo agrupado por projeto, API key ID e line item;
- custo diário.

Períodos disponíveis na primeira versão:

- 7 dias;
- 30 dias.

## Operação

1. Criar uma Admin API key na organização OpenAI usada pelo FlipForm.
2. Adicionar `OPENAI_ADMIN_KEY` somente ao ambiente server-side da aplicação.
3. Opcionalmente adicionar `OPENAI_ORGANIZATION_ID`.
4. Opcionalmente registrar o saldo visto manualmente no painel da OpenAI em `OPENAI_OPERATIONAL_BALANCE_USD`.
5. Fazer redeploy.
6. Acessar **Super Admin → OpenAI**.

## O que este PR não faz

- não compra créditos;
- não cadastra cartão;
- não configura auto-reload;
- não consulta endpoint interno/privado da OpenAI;
- não cria saldo compartilhado entre tenants;
- não converte saldo OpenAI em créditos de cliente;
- não implementa cobrança comercial.

A recarga comercial do FlipForm permanece para um PR posterior.

## Validação antes do merge

- CI / Typecheck / Build verde;
- Smoke Test verde;
- Playwright E2E verde;
- preview do `flipform` verde;
- preview do `flipform-staging` verde;
- nenhum conflito com a `main`.
