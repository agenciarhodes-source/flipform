# PR629 — Campos de ciclo de vida (preparados, não aplicados)

**23/11/2026 — DRAFT, sem aprovação de retenção, sem migração na Neon ou em produção.**

Cinco campos `DateTime?` opcionais foram adicionados ao esquema Prisma e às cinco instruções aditivas `ADD COLUMN` de uma migração SQL. Registros históricos permanecem sem marco temporal (NULL), e **nenhuma limpeza ou backfill foi criado**.

| Tabela | Campo novo | Transição implementada |
|---|---|---|
| `api_v1_integrations` | `disabled_at` | Somente transição ativa→desativada; reativar limpa o relógio. Nova integração nasce desativada e com NULL |
| `api_v1_quota_buckets` | `window_end` | Gravado na inserção com a duração da política de quota daquele instante |
| `api_v1_idempotency_records` | `completed_at` | Ainda NULL: não há conclusão reconciliada de deduplicação no protótipo |
| `api_v1_inbox_events` | `finalized_at` | Ainda NULL: eventos Inbox ficam held, sem endpoint para conclusão |
| `api_v1_outbox_events` | `finalized_at` | Preenchido somente em `simulated_success` do simulador CI; retry e dead_letter mantêm NULL |

Os registros anteriores à implantação precisarão de tratamento separado e **não podem receber datas fabricadas**. As 10 FKs RESTRICT permanecem. Os prazos candidatos continuam pendentes de análise do proprietário e revisão jurídica. Uma migração aditiva não representa autorização de expurgo nem de rollout.

**Verificações:** tests/pr629-lifecycle-clocks.test.ts e tests/test_pr629_retention_clock_gate.py. A execução da migração deve ser primeiro validada em banco descartável aprovado; nada foi aplicado ao Neon QA/default ou à produção neste PR.
