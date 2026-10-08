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

Não há variável de ambiente nem chamada de rede ao Google. Existem a API de configuração, a tela e a fila de eventos. As tabelas do outbox existem apenas como schema e migration (ver Banco / Neon). Nenhuma conversão é enviada ao Google. O provider `google_ads` legado em `lib/tracking.ts` continua registrando `not_dispatched`, e o fluxo Meta não foi tocado.

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

A API de configuração lê e grava `google_conversion_mappings`; a fila grava `google_conversion_events` na movimentação do Kanban. O deploy não depende da migration: sem as tabelas, a API responde `503`. Ela precisa ser aplicada separadamente no Neon, com aprovação explícita, antes da etapa que cria eventos na movimentação do lead. A presença do arquivo não significa que o banco foi alterado.

## API de configuração

| Rota | Permissão | Efeito |
| --- | --- | --- |
| `GET /api/integrations/google-funnel/mappings` | `INTEGRATIONS_VIEW` | Lista mapeamentos ativos e os pipelines/etapas do tenant. |
| `POST /api/integrations/google-funnel/mappings` | `INTEGRATIONS_EDIT` | Cria um mapeamento. Restaura o registro se ele estava arquivado. |
| `PUT /api/integrations/google-funnel/mappings/{id}` | `INTEGRATIONS_EDIT` | Atualiza o mapeamento. |
| `DELETE /api/integrations/google-funnel/mappings/{id}` | `INTEGRATIONS_EDIT` | Arquiva (remoção lógica) e desativa. |

O tenant vem sempre da sessão. Pipeline e etapa são validados contra o tenant, e etapas ou pipelines arquivados são recusados. Cada alteração gera Audit Log. Se as tabelas ainda não existirem no ambiente, as rotas respondem `503` com mensagem explícita, sem afetar o restante do sistema.

Esta camada é só configuração e não envia conversão.

## Tela

Em **Integrações → Google Ads — Funil de conversões** (`app/(app)/integrations/google-funnel-card.tsx`), o owner ou admin escolhe o pipeline e vê todas as etapas em ordem: as que têm ação de conversão e as internas. É possível adicionar, ativar, desativar e remover conversões. A tela usa somente a API acima, avisa que o envio ao Google ainda não está ativo e mostra a mensagem de indisponibilidade quando as tabelas não existem no ambiente.

## Fila de eventos

Quando um usuário move um lead no Kanban (`POST /api/leads/{id}/move`), depois que a movimentação e o histórico já foram gravados e depois do disparo Meta existente, o FlipForm consulta os mapeamentos ativos da etapa de destino e cria um evento `PENDING` em `google_conversion_events` para cada um.

| Resultado | Significado |
| --- | --- |
| `queued` | Evento criado na fila. |
| `already_signaled` | Regra `first_entry` e o lead já tem evento para esse mapeamento. |
| `duplicate` | A mesma transição já gerou o evento (chave idempotente). |
| `awaiting_purchase` | Modo `purchase` sem `LeadPurchase`; nenhum evento é criado. |

O enfileiramento é best-effort: qualquer falha é registrada em log sem dados do lead e nunca bloqueia, atrasa de forma perceptível ou desfaz a movimentação. Sem as tabelas no ambiente, o funil fica simplesmente desligado.

Nesta etapa os eventos ficam em `PENDING` e nada é enviado ao Google. Só a movimentação manual no Kanban enfileira; criação de lead, automações e Flip AI ainda não. Um evento em `awaiting_purchase` também não é retomado automaticamente quando a compra é registrada depois. Esses pontos entram em etapas seguintes.

## Transporte (Data Manager API)

`lib/tracking/google-data-manager.ts` monta e envia a conversão para `POST https://datamanager.googleapis.com/v1/events:ingest`. A Data Manager API não usa developer token; a autenticação é por service account com o escopo `https://www.googleapis.com/auth/datamanager`.

Ele é chamado somente pelo processador da fila (abaixo), é fail-closed e depende de todas as variáveis abaixo.

| Variável | Padrão | Função |
| --- | --- | --- |
| `GOOGLE_FUNNEL_TRANSPORT_ENABLED` | desligado | Só `true` liga o transporte. |
| `GOOGLE_DATA_MANAGER_SERVICE_ACCOUNT_JSON` | ausente | JSON da service account (puro ou base64). Segredo de servidor. |
| `GOOGLE_FUNNEL_TENANT_ACCOUNTS` | vazio | Pareamento `tenantId:customerId`, separado por vírgula. Um tenant só envia para a conta pareada com ele. |
| `GOOGLE_DATA_MANAGER_LOGIN_ACCOUNT_ID` | conta operada | Conta (por exemplo a MCC) onde a service account é usuária. |
| `GOOGLE_FUNNEL_VALIDATE_ONLY` | dry run | Só `false` faz o Google ingerir de fato; caso contrário a requisição é apenas validada. |
| `GOOGLE_FUNNEL_SEND_USER_DATA` | desligado | Só `true` inclui e-mail e telefone do lead, normalizados e com hash SHA-256. |

Regras:

- A conta e a ação de conversão vêm do mapeamento (`customers/{id}/conversionActions/{id}`); a ação precisa ser do tipo `UPLOAD_CLICKS`.
- `transactionId` é a chave idempotente do evento, o que permite ao Google deduplicar reenvios.
- Um único identificador de clique por evento. Sem click ID e sem dados de usuário liberados, o evento não é enviável (`NO_IDENTIFIER`).
- Dados de usuário nunca saem em claro. Quando enviados, a requisição declara consentimento (`CONSENT_GRANTED`); só ligue `GOOGLE_FUNNEL_SEND_USER_DATA` se o formulário e a política de privacidade do tenant cobrirem esse uso.
- Uma tentativa por chamada, sem retry interno. `401`, `403`, `408`, `429` e `5xx` viram nova tentativa; demais `4xx` são rejeição. Só um código simbólico é devolvido; mensagens do provedor, tokens e payloads não são registrados.
- Resposta `200` significa que o Google aceitou a requisição para processamento (`SENT`), não que a conversão foi atribuída.

## Processador da fila

`/api/cron/google-conversions` (autenticado por `CRON_SECRET`, como os demais jobs) executa `processGoogleConversionOutbox`. Aceita `GET` (agendador) e `POST` (execução manual), como o worker central de automações. O projeto não usa `vercel.json`: o agendamento fica no mesmo agendador externo dos demais jobs. Sem `CRON_SECRET` no ambiente a rota responde `401`, e com o transporte desligado ela termina sem ler a fila.

Além do agendador, a movimentação no Kanban dispara o processador logo após a resposta (`scheduleGoogleConversionDelivery`), fora do caminho crítico da requisição e somente quando um evento foi enfileirado. Com o transporte desligado essa chamada não faz nada. O agendador continua sendo a rede de segurança para as novas tentativas.

A cada execução:

1. Se o transporte estiver desligado, sem credencial ou sem nenhum tenant pareado, termina sem ler a fila.
2. Lê até 10 eventos `PENDING`/`RETRY` vencidos, somente de tenants pareados em `GOOGLE_FUNNEL_TENANT_ACCOUNTS`.
3. Reserva cada evento de forma otimista (duas execuções simultâneas não enviam o mesmo evento) e incrementa a tentativa.
4. Lê e-mail, telefone e `gclid` do lead, monta a requisição e chama o transporte.
5. Grava o resultado:

| Resultado | Estado | Observação |
| --- | --- | --- |
| Aceito pelo Google | `SENT` | Atribuição é confirmada depois, pelos diagnósticos do Google. |
| Dry run validado | `PENDING` | Não consome tentativa; reavaliado em 1 hora. Código `DRY_RUN_VALIDATED`. |
| Rejeitado (`4xx`) | `REJECTED` | Final. |
| Falha temporária | `RETRY` | Backoff de 1 minuto a 6 horas, até 6 tentativas; depois `FAILED`. |
| Sem identificador, conta não pareada, lead inexistente, evento com mais de 80 dias | `FAILED` | Sem chamada ao Google. Códigos `NO_IDENTIFIER`, `TENANT_ACCOUNT_NOT_ALLOWED`, `LEAD_NOT_FOUND`, `EXPIRED`. |

O processador só atualiza `google_conversion_events`. Leads, etapas e atribuição são apenas lidos. Uma falha no meio do envio mantém a reserva por 10 minutos e o evento é reenviado com o mesmo `transactionId`, que o Google usa para deduplicar.

## Próximas etapas

1. **Atribuição e demais origens**: colunas `gbraid`/`wbraid` em `lead_attributions`, evento de `Lead` na criação pelo formulário e retomada de `awaiting_purchase`. Ainda sem envio.
2. **Operação**: agendar o job, parear o tenant piloto, validar em dry run e só então liberar o envio real.
3. **UI administrativa**: pipeline, etapa, ação de conversão, primária/secundária, valor, moeda e ativação.
4. **Analytics**: leads, qualificados, oportunidades, contratos, receita, custo, origem e campanha.

Toda migration é aditiva e aplicada no Neon separadamente, com aprovação explícita.
