# Compras recorrentes por lead

O histórico financeiro do cliente agora fica em `lead_purchases`: cada lead pode ter uma ou várias compras, com valor em centavos, moeda BRL, data da compra, número do pedido, forma de pagamento e observações.

## Valor vendido legado vs compras

Os campos legados do lead (`saleValueCents`, `saleCurrency`, `saleValueUpdatedAt`, `saleValueUpdatedBy`) continuam existindo para compatibilidade. A fonte principal de receita é `lead_purchases`. Quando um lead ainda não tem nenhuma compra registrada, o Dashboard pode usar `saleValueCents > 0` como fallback de receita inicial, sem somar os dois para o mesmo lead.

## Receita no Dashboard

A receita do período soma compras por `purchaseDate`, respeitando tenant, pipeline, formulário, estado, cidade e escopo do usuário. O Dashboard também separa receita de primeira compra e receita recorrente, calcula compras, clientes compradores, clientes recorrentes, taxa de recompra, ticket médio e LTV médio.

## Filtro personalizado

No Dashboard, selecione `Personalizado` e informe data inicial e data final. A API aceita `period=custom&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` e compara com uma janela anterior equivalente.

## Meta/CAPI

Registrar compras recorrentes não dispara automaticamente evento Meta Purchase neste PR. Eventos de conversão existentes no Kanban continuam inalterados.

## Produção

Após deploy, rode a migration no Neon. Se algum ambiente estiver defasado, `scripts/repair-production-schema.ts` cria `lead_purchases` e índices de forma idempotente.
