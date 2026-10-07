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

Não há tela, variável de ambiente ou chamada de rede. Existe apenas a API de configuração dos mapeamentos. As tabelas do outbox existem apenas como schema e migration (ver Banco / Neon). Nenhuma conversão é enviada ao Google. O provider `google_ads` legado em `lib/tracking.ts` continua registrando `not_dispatched`, e o fluxo Meta não foi tocado.

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

## Banco / Neon

A migration `20261007190000_google_conversion_outbox` cria somente duas tabelas novas e não altera nenhuma tabela existente:

- `google_conversion_mappings`: etapa → ação de conversão, por tenant. Única por `tenant_id + stage_id + conversion_action_resource`. Nasce com `enabled = false`. Remoção é lógica (`archived_at`), para preservar o histórico dos eventos.
- `google_conversion_events`: fila/outbox e trilha de auditoria. Única por `tenant_id + idempotency_key`. Guarda estado, tentativas, datas e código simbólico de erro; não guarda payload, token nem dados de contato.

`trigger_rule` define a regra de disparo do mapeamento: `first_entry` (uma conversão por lead naquela etapa, padrão) ou `every_entry`. A janela de conversão pertence à ação de conversão no Google Ads e não é replicada aqui. Contadores de enviadas, aceitas e erros são derivados de `google_conversion_events`.

Somente a API de configuração lê e grava `google_conversion_mappings`; nada grava `google_conversion_events` ainda. O deploy não depende da migration: sem as tabelas, a API responde `503`. Ela precisa ser aplicada separadamente no Neon, com aprovação explícita, antes da etapa que cria eventos na movimentação do lead. A presença do arquivo não significa que o banco foi alterado.

## API de configuração

| Rota | Permissão | Efeito |
| --- | --- | --- |
| `GET /api/integrations/google-funnel/mappings` | `INTEGRATIONS_VIEW` | Lista mapeamentos ativos e os pipelines/etapas do tenant. |
| `POST /api/integrations/google-funnel/mappings` | `INTEGRATIONS_EDIT` | Cria um mapeamento. Restaura o registro se ele estava arquivado. |
| `PUT /api/integrations/google-funnel/mappings/{id}` | `INTEGRATIONS_EDIT` | Atualiza o mapeamento. |
| `DELETE /api/integrations/google-funnel/mappings/{id}` | `INTEGRATIONS_EDIT` | Arquiva (remoção lógica) e desativa. |

O tenant vem sempre da sessão. Pipeline e etapa são validados contra o tenant, e etapas ou pipelines arquivados são recusados. Cada alteração gera Audit Log. Se as tabelas ainda não existirem no ambiente, as rotas respondem `503` com mensagem explícita, sem afetar o restante do sistema.

Esta camada é só configuração: salvar ou ativar um mapeamento ainda não cria evento nem envia conversão. Ainda não há tela; ela vem na etapa de UI.

## Próximas etapas

1. **Outbox**: criação do evento na movimentação do lead usando as tabelas acima, colunas `gbraid`/`wbraid` em `lead_attributions`, idempotência, estados, retry e auditoria. Ainda sem envio.
2. **Transporte**: Enhanced Conversions for Leads via Data Manager API, com conexão por OAuth do cliente ou conta gerenciadora (decisão pendente).
3. **UI administrativa**: pipeline, etapa, ação de conversão, primária/secundária, valor, moeda e ativação.
4. **Analytics**: leads, qualificados, oportunidades, contratos, receita, custo, origem e campanha.

Toda migration é aditiva e aplicada no Neon separadamente, com aprovação explícita.
