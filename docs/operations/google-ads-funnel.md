# Google Ads Funnel

## Objetivo

Devolver ao Google Ads sinais reais do CRM (lead, lead qualificado, lead convertido e receita) a partir do Pipeline/Kanban, em paralelo ao funil Meta existente e sem alterá-lo.

```text
Pipeline → Etapa do Kanban → Ação de conversão Google → Outbox → Transporte → Google
```

O pipeline é a fonte de verdade comercial. O Google é um destino de sinais. O FlipForm não cria nem edita campanhas, anúncios, orçamento, palavras-chave, lances ou ações de conversão.

## Estado atual

Esta etapa entrega somente a fundação, sem efeito em produção:

- `lib/tracking/google-funnel.ts`: contrato do mapeamento, resolução de valor, chave idempotente, estados do evento, política de retry e código seguro de erro.
- `lib/tracking/google-click-ids.ts`: captura e preservação de `gclid`, `gbraid` e `wbraid`.
- `tests/google-funnel.test.ts`: testes unitários executados no CI.

Não há tabela nova, migration, rota, tela, variável de ambiente ou chamada de rede. Nenhuma conversão é enviada ao Google. O provider `google_ads` legado em `lib/tracking.ts` continua registrando `not_dispatched`, e o fluxo Meta não foi tocado.

## Mapeamento

Cada mapeamento liga uma etapa a uma ação de conversão que já existe na conta Google Ads do cliente.

| Campo | Regra |
| --- | --- |
| `pipelineId`, `stageId` | Validados contra o tenant da sessão no servidor. O payload não aceita `tenantId`. |
| `conversionActionResource` | `customers/{customerId}/conversionActions/{id}`. O FlipForm não inventa IDs nem labels. |
| `conversionCategory` | `lead`, `qualified_lead` ou `converted_lead`. |
| `optimizationRole` | `primary` ou `secondary`. Padrão `secondary` (observabilidade, sem influenciar lances). |
| `valueMode` | `none`, `fixed` ou `purchase`. |
| `conversionValue` | Aceito somente com `fixed`; positivo, até duas casas decimais. |
| `currency` | Código ISO de três letras. Padrão `BRL`. |
| `enabled` | Padrão `false`. A ativação é sempre explícita. |

Nem toda etapa precisa de conversão. Etapas sem mapeamento geram apenas histórico interno.

`optimizationRole` registra a intenção do tenant e orienta relatórios. A definição efetiva de primária/secundária pertence à ação de conversão na conta Google Ads e não é alterada pelo FlipForm.

## Valor

- `none`: conversão sem valor.
- `fixed`: valor configurado no mapeamento, validado no servidor.
- `purchase`: valor vem exclusivamente de um `LeadPurchase` explícito. Sem compra registrada, o evento fica em `awaiting_purchase` e nada é enviado. Mover o lead de etapa nunca inventa receita, igual à regra do Purchase da Meta.

## Atribuição

`gclid`, `gbraid` e `wbraid` são opacos: são guardados como recebidos ou não são guardados. Um valor já armazenado nunca é apagado nem substituído por movimentação, edição ou reenvio; apenas campos vazios são preenchidos. Cada conversão usa um único identificador, na ordem `gclid`, `gbraid`, `wbraid`.

Hoje `LeadAttribution` persiste apenas `gclid`. As colunas `gbraid` e `wbraid` entram na etapa do outbox, em migration aditiva.

## Idempotência

```text
tenant + lead + etapa + ação de conversão + transição
```

A chave é um SHA-256 determinístico desses cinco valores. A transição é o registro de `LeadStageHistory` que causou o evento. Retries reutilizam a mesma chave e não geram segunda conversão.

## Estados do evento

```text
PENDING → SENT → ACCEPTED
            ├──→ REJECTED
            └──→ RETRY → SENT …
PENDING/SENT/RETRY → FAILED → RETRY (reprocessamento explícito)
```

`ACCEPTED` e `REJECTED` são finais. `FAILED` só volta à fila por reprocessamento explícito. São feitas no máximo 6 tentativas, com backoff exponencial de 1 minuto até 6 horas. A auditoria guarda estado, tentativas, datas e um código simbólico de erro; mensagens do provedor, tokens e payloads não são armazenados.

## Garantias

- O movimento do lead nunca depende do Google. Indisponibilidade externa não desfaz nem bloqueia a operação do CRM.
- Isolamento por tenant em mapeamento, credenciais e eventos.
- Nenhuma decisão automática de CRM: o sistema só sinaliza etapas movidas por um usuário ou por regra aprovada.
- Meta Pixel/CAPI, GTM, WhatsApp e Stripe ficam fora do escopo.

## Próximas etapas

1. **Outbox**: tabelas aditivas de mapeamento e de eventos, colunas `gbraid`/`wbraid`, criação do evento na movimentação, idempotência, estados, retry e auditoria. Ainda sem envio.
2. **Transporte**: Enhanced Conversions for Leads via Data Manager API, com conexão por OAuth do cliente ou conta gerenciadora (decisão pendente).
3. **UI administrativa**: pipeline, etapa, ação de conversão, primária/secundária, valor, moeda e ativação.
4. **Analytics**: leads, qualificados, oportunidades, contratos, receita, custo, origem e campanha.

Toda migration é aditiva e aplicada no Neon separadamente, com aprovação explícita.
