# Exportação XLSX de relatórios

A exportação principal de Relatórios gera um arquivo Excel real (`.xlsx`) no backend por `GET /api/reports/export`. O processamento usa runtime Node.js e preserva a validação de permissão `REPORTS_EXPORT`, o contexto do tenant e os filtros validados do relatório.

## Quem pode exportar

- `owner` e `admin` exportam dados da empresa conforme as permissões atuais.
- `manager` só exporta se a política `REPORTS_EXPORT` permitir.
- `agent`, se receber permissão explícita de exportação, permanece limitado aos próprios leads pelo escopo do relatório.
- `viewer` não exporta salvo regra explícita futura.
- O endpoint nunca aceita `tenantId` do frontend e valida `pipelineId`, `formId` e `assignedTo` contra o tenant autenticado.

## Filtros aplicados

A exportação respeita os mesmos query params da tela de Relatórios:

- `range`
- `from`
- `to`
- `pipelineId`
- `formId`
- `source`
- `assignedTo`

A aba **Leads** usa leads criados no período selecionado. A aba **Compras** usa compras com `purchaseDate` dentro do período, preservando os demais filtros, tenant isolation e escopo RBAC.

## Abas geradas

1. **Resumo** — empresa, período, geração, usuário, filtros e indicadores comerciais/operacionais.
2. **Leads** — uma linha por lead, com cliente, localização, origem, formulário, pipeline, etapa, status, vendedor, datas, receita, compras, tipo de cliente, motivo de perda e tarefas.
3. **Compras** — uma linha por compra registrada, com dados do cliente, vendedor, formulário, pedido, pagamento, valor, tipo da compra e data de registro.

## Regras de data de fechamento

A data de fechamento é calculada pela primeira movimentação do lead para a etapa final ativa do pipeline. A etapa final é a etapa ativa com maior `orderIndex`. Se o lead estiver `won` e não houver histórico para a etapa final, o fallback é `saleValueUpdatedAt`; se ausente, `updatedAt`. Leads não fechados ficam com a célula vazia.

## Regra de receita

Para evitar duplicidade:

1. Se o lead tiver registros em `lead_purchases`, a receita é a soma de `amountCents` das compras.
2. Se não tiver compras, a receita é R$ 0,00.
3. `saleValueCents` legado não é somado nem usado como fallback.

A quantidade de compras usa exclusivamente `purchases.length`.

## Limites

- Leads: até 10.000 linhas.
- Compras: até 50.000 linhas.

Quando um limite é atingido, a aba **Resumo** exibe um aviso para o usuário.

## Formato do arquivo

O arquivo é retornado como `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, com nome `flipform-relatorio-AAAA-MM-DD_a_AAAA-MM-DD.xlsx`, cabeçalhos formatados, filtros automáticos, linhas alternadas e datas/moedas como tipos nativos do Excel.

## Comportamento para Atendente/Vendedor

O escopo de vendedor/atendente segue `buildReportContext`: usuários sem `REPORTS_VIEW_ALL` exportam somente leads atribuídos ao próprio `userId`, mesmo se tentarem alterar query params como `assignedTo`.
