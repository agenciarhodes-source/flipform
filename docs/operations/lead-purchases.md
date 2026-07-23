# Compras recorrentes por lead

O histórico financeiro do cliente agora fica em `lead_purchases`: cada lead pode ter uma ou várias compras, com valor em centavos, moeda BRL, data da compra, número do pedido, forma de pagamento e observações.

## Valor vendido legado vs compras

Os campos legados do lead (`saleValueCents`, `saleCurrency`, `saleValueUpdatedAt`, `saleValueUpdatedBy`) continuam existindo para compatibilidade. A fonte oficial da receita do Dashboard é exclusivamente `lead_purchases`. Sem compra registrada, a receita é R$ 0,00; `saleValueCents` permanece apenas como compatibilidade e não é usado como fallback.

## Receita no Dashboard

A receita do período soma compras por `purchaseDate`, respeitando tenant, pipeline, formulário, estado, cidade e escopo do usuário. O Dashboard também separa receita de primeira compra e receita recorrente, calcula compras, clientes compradores, clientes recorrentes, taxa de recompra, ticket médio e LTV médio.

## Filtro personalizado

No Dashboard, selecione `Personalizado` e informe data inicial e data final. A API aceita `period=custom&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` e compara com uma janela anterior equivalente.

## Meta/CAPI

Meta Purchase só é enviado quando existir uma venda manual com valor positivo; a CAPI usa esse valor real e ignora eventos de fechamento sem compra.

## Produção / Neon

Após merge/deploy, garantir que a migration `20260704120000_add_lead_purchases` foi aplicada no Neon.

Tabela esperada:
`public.lead_purchases`

Caso o ambiente esteja defasado, rodar:
`npm run repair:production-schema`
ou aplicar a migration pelo processo operacional definido.

O repair é idempotente e valida/cria tabela, colunas, foreign keys e índices principais sem criar dados reais e sem apagar dados existentes.
