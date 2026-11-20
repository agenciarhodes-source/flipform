# PR01 — Fase 7 | Retenção sintética, métricas e revisão SQL offline (DRAFT)

**19/11/2026 · PR #627 · `feature/pr01-global-api-foundation`.**

## Implementado

- **Retenção e observabilidade** em `lib/api-v1/retention-observability.ts`: um módulo `server-only` que retorna somente contagens por estado dos eventos e tentativas, leases vencidos, buckets de quota e claims de replay. Não exporta payload, IDs, chaves, nonce ou dado pessoal.
- **Limpeza controlada e não agendada**: dry-run é o padrão. O único dado que pode ser apagado no protótipo são hashes de nonce de `ApiV1WebhookReplay` expirados há mais de **24 horas**, com seleção de no máximo **25** IDs e filtro explícito por tenant/integração. Eventos, idempotência, Inbox/Outbox, tentativas, credenciais, quotas e auditorias **nunca são apagados** por essa rotina.
- **Barreiras sintéticas**: ambos os serviços exigem `CI=true`, a API habilitada *apenas* no processo de teste e `DATABASE_URL` estritamente local (`127.0.0.1:5432/flipform_ci`), além de slug com prefixo `pr01-retention-` e integração `PR01 Phase7 synthetic`. Sem todas essas condições, nenhuma leitura ou gravação é realizada pelo serviço.
- **Testes de integração** `tests/pr01-retention-observability.integration.test.ts`: relatórios sem dados identificáveis, apenas registros sintéticos, dry-run sem alteração, eliminação explicitamente autorizada de 1 nonce vencido, preservação de registro recente e de outro tenant, retenção de quota e histórico de auditoria, flag OFF e tenant não sintético bloqueados.
- **Auditoria de SQL para PR01** em `scripts/pr01_offline_sql_diff_audit.py` e `.github/workflows/pr01-offline-schema-delta.yml`. Diferentemente da auditoria PR00, que permanece restrita à branch antiga, esse workflow compara o commit base exato da `main` com a branch do PR #627. Usa `prisma migrate diff --from-schema-datamodel ... --to-schema-datamodel ... --script`, **sem conexões DB** e com URL intencionalmente inválida. Aceita somente `CREATE TABLE`, `CREATE INDEX` e `ALTER TABLE ADD FOREIGN KEY` direcionados aos **10 modelos novos**; rejeita DDL nas 92 tabelas antigas, tipos novos e qualquer operação de destruição ou manipulação de dados. Gera um artefato SQL + relatório para revisão manual e checksum.
- **Sem migration aplicada**. A revisão SQL offline não atesta que o banco real tem o mesmo estado da `main`, não substitui ensaio isolado, plano de rollback, snapshot nem aprovação expressa.

## Decisões ainda em aberto

1. Aprovar políticas de retenção reais, categoria de dados, LGPD, TTL por cliente e exigências de auditoria/segurança. O limiar de 24h é **exclusivamente do fixture sintético**.
2. Planejar controle de retenção de quotas sem reabrir janelas de rate-limit. **Nenhum bucket de quota é excluído agora.**
3. Definir tratamento e retenção de fila de descarte, idempotência e logs de auditoria. Não deletar cadeias com cascatas enquanto os requisitos de preservação não estiverem homologados.
4. Revisar o SQL gerado no GitHub, incluindo FKs e `onDelete: Cascade`; conferir target real com segurança em staging isolado e escrever roteiro de retorno antes de autorizar migration.
5. Manter os gates PR00, revisão de identidade de runtime, proteção da `main`, CI, egress, TLS/IP pinning e KMS. Nenhum endpoint real da API está autorizado.
6. Os workflows de reparação permanecem desativados conforme último estado informado; esta etapa não os revalidou nem reativou.

## Critérios para considerar Fase 7 testada

- CI (Prisma, TypeScript, Python), Smoke Test, PostgreSQL descartável, Playwright, Gitleaks e Semgrep verdes.
- Novo workflow **PR01 additive SQL delta (OFFLINE)** verde. A verificação PR00 SQL Offline pode continuar **skipped**; isso é um gate separado e não equivale à revisão PR01.
- A revisão manual do artefato SQL, banco de destino e rollback permanece pendente independentemente do resultado CI.

**GO apenas para desenvolvimento isolado. NO-GO para merge, deploy, migrations/DDL Neon, dados reais, integrações externas ou reativação de workflows.**
