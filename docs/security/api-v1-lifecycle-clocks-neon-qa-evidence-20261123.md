# PR629 — homologação real da migração de cinco relógios em Neon QA isolado

**Data:** 2026-11-23  
**Classificação:** evidência de esquema e simulações SQL com dados sintéticos; **não** é aprovação de retenção, PITR ou publicação.  
**PR / código:** #629, `ddee2e79a7f6ee9e91de3678866c01593a161c2d`.  
**Projeto Neon:** `holy-fog-36254823` (`flipform-staging-isolated`) — distinto do ambiente de produção.  
**Branch de origem QA:** `br-snowy-band-bcb0auy6` (`api-v1-pr629-full-schema-lab-20261121`, não default).  
**Branch criada exclusivamente para este ensaio:** `br-fancy-heart-bcjoywqg` (`api-v1-pr629-lifecycle-disposable-20261123`, não default).  
**Banco:** `flipform_staging`. Nenhuma chave M2M de cliente, dados reais, campanhas ou chamadas externas foram usados.

## Execução e comprovação

1. **Antes:** a nova branch não possuía nenhuma das cinco colunas `disabled_at`, `window_end`, `completed_at`, `finalized_at` (Inbox) ou `finalized_at` (Outbox).
2. **Migração:** aplicadas em uma única transação as cinco instruções `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ... TIMESTAMP(3)` de `prisma/migrations/20261123170000_api_v1_lifecycle_clocks/migration.sql`, sem DML de limpeza ou alteração de FK.
3. **Depois:** cinco colunas presentes, todas `timestamp without time zone`, `nullable=YES`, sem `DEFAULT`; totais permanecem **102 tabelas, 356 índices, 139 FKs**.
4. **Diff contra branch QA de origem:** somente cinco acréscimos de colunas, nenhum outro objeto alterado. Na branch de origem, número dessas colunas **continua zero**.
5. **Idempotência de DDL:** as mesmas cinco instruções foram reaplicadas sem erro e sem criação duplicada de colunas.
6. **Inserções sintéticas isoladas:** foi criado um conjunto com 1 integração adicional, 1 chave explicitamente **revogada**, 1 bucket de quota, 2 operações idempotentes, 2 Inbox e 2 Outbox, vinculados somente a um tenant QA preexistente. São artefatos descartáveis que permanecem **apenas na branch de ensaio**.
7. **Simulações SQL de transição:** integração `active→disabled` marcou data; `disabled→active` limpou data; quota manteve término original de 60 segundos após incremento; `retry` e `dead_letter` mantiveram `finalized_at=NULL`; `simulated_success` marcou `finalized_at`; registros Inbox e idempotência ainda sem reconciliação continuaram `NULL`. Todas as verificações retornaram verdadeiro.

**Escopo técnico dos testes:** a escrita de registros e as transições acima foram feitas por **SQL diretamente na branch descartável**, não por chamadas HTTP à aplicação Vercel. Os testes TypeScript do helper e os testes da API executam separadamente no GitHub CI. Portanto esta evidência **não prova integração de ponta a ponta dos handlers** nem produção, nem o uso operacional de timers de retenção.

## Riscos e limites mantidos

- Datas novas em registros históricos permanecem `NULL`. A migração não preencheu retroativamente datas que não foram registradas.
- `api_v1_idempotency_records.completed_at` e `api_v1_inbox_events.finalized_at` são campos preparados, mas **não existe fluxo real de encerramento apto a preenchê-los** nesta versão. `api_v1_outbox_events.finalized_at` é escrito apenas no simulador restrito a CI quando há sucesso; não há worker real liberado.
- Regras e prazos de retenção, legal hold, descarte físico e resposta a titular continuam **pendentes de decisão**. Em especial, nenhuma limpeza automática foi implementada/habilitada.
- Snapshot restore já fora comprovado em laboratório, mas **PITR por timestamp/LSN, RPO/RTO, reconexão do aplicativo e atestação universal de egress** ainda não estão comprovados.
- Nenhum `merge`, schema/deploy em produção, alteração de parent/default branch, reativação de manutenção ou ativação da API foi realizado. `NO_GO` mantido.

## Próximo aceite técnico

Requer-se revisão do conjunto código/Prisma/migração e posterior autorização específica para eventual implantação em ambiente de ensaio de aplicação. Publicação produtiva necessita aprovação separada de retenção, recuperação e egress, além de autorização explícita do rollout.
