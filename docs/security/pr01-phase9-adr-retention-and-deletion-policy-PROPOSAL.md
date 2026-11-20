# ADR PR01-009 — Retenção, exclusão e preservação de auditoria (PROPOSTA / NÃO APROVADA)

**Data:** 19/11/2026 · **PR:** #627 · **Branch:** `feature/pr01-global-api-foundation` (Draft)

## Contexto demonstrado (Fase 8)

O ensaio **somente no PostgreSQL local descartável** confirmou que a exclusão de um tenant fictício faz o PostgreSQL excluir sua linha de `api_v1_credential_audits` via `ON DELETE CASCADE`. Dez relacionamentos da API v1 possuem `CASCADE`, direta ou indiretamente. Sem uma política de retenção, esta estrutura permite apagar evidências de autorização, tentativas, integridade de filas e proteção contra replay, mesmo quando a operação de exclusão parece atingir apenas a empresa ou integração.

**Decisão atual:** `UNRESOLVED`. **NO-GO para migração real**, ainda que o CI esteja verde.

## Proposta operacional para discussão técnica

1. **Desativar em vez de excluir**: para futuros endpoints da API v1, bloquear hard-delete automático de tenant ou integração. A operação normal proposta é desativar a integração, revogar chaves e impedir novos eventos. Isto **não modifica** rotas existentes nem pressupõe bloqueio global do CRM.
2. **Auditoria M2M**: preservar eventos de emissão, rotação e revogação de chaves, identidade do ator e timestamps conforme minimização e política de retenção aprovada. Antes de publicar, decidir entre FK sem cascata com bloqueio transacional ou arquivo de auditoria independente, com controles de acesso, integridade, minimização e recuperação. Não manter segredos em auditoria.
3. **Histórico de tentativas e DLQ**: não permitir que apagar Inbox/Outbox/integration destrua histórico ainda necessário à conciliação ou investigação. Propor restrição de exclusão enquanto houver filas pendentes, idempotência ativa ou retenção exigida.
4. **Janela de rate limit e replay**: jamais purgar quotas ainda válidas, para não restaurar consumo. Replays de webhook devem conservar a janela de proteção anti-reenvio e limpeza dedicada, não exclusão implícita em cascata.
5. **LGPD e guarda legal**: definir para cada categoria base legal, finalidade, destinatários, mínimo de informação necessária, período e condições de eliminação/anomização. Preservação de auditoria não é autorização para retenção indefinida. Requisições de titulares, litígios e legal hold precisam de fluxo auditado e tratamento individual.
6. **Exclusão definitiva excepcional**: apenas após inventário completo de dependências, retenção/backup autorizado, cessação de entregas, suspensão de credenciais, aprovação da política, testes isolados e mecanismo reversível/forward-fix. Nenhuma ação de remoção em produção está autorizada por este ADR.

## Matriz de decisão pendente

A matriz machine-readable está em `docs/security/pr01-phase9-retention-decision-matrix.json`. Todos os dez vínculos estão marcados `PENDING`, com pai/filho e mitigação proposta. O documento não pode ser autoaprovado alterando um status: `scripts/pr01_retention_release_gate.py` rejeita qualquer tentativa de marcar um campo como aprovado no estado atual.

| Classe | Componentes | Risco principal |
|---|---|---|
| Auditoria crítica | `api_v1_credential_audits`, `api_v1_delivery_attempts` | Perda de evidência histórica de segurança e entrega |
| Integridade operacional | `api_v1_idempotency_records`, `api_v1_inbox_events`, `api_v1_outbox_events` | Perda de cadeia, duplicação ou ocultação de falhas |
| Segurança transitória | `api_v1_quota_buckets`, `api_v1_webhook_replays` | Reset do rate limit ou falha de anti-replay |
| Autorização e configuração | `api_v1_integrations`, `api_v1_credentials`, `tenant_entitlement_grants` | Exclusão de histórico de autorização e gestão de integrações |

## Alternativas a avaliar — sem alterar schema nesta fase

- **A — `RESTRICT` / `NO ACTION`** em relações críticas: impede apagamento do pai quando há filhos, mas exige fluxo explícito de expurgo e testes de bloqueio de exclusão em todas as rotas pertinentes.
- **B — auditoria desacoplada e minimizada**: permite hard-delete de configuração sem descartar histórico obrigatório, com referência pseudonimizada; exige revisão de privacidade, proteção de chaves e integridade.
- **C — manter `CASCADE`**: **não recomendado para trilhas críticas no estado atual**, já que o ensaio comprovou perda automática de registros.
- **D — combinação por categoria**: provável direção técnica; não tratar todos os tipos de registro como se tivessem a mesma finalidade ou período de retenção.

**Proposta preferencial para avaliação:** D, com mecanismos de A para históricos críticos ou B quando justificável. Não é aprovação nem uma escolha irrevogável.

## Critérios obrigatórios antes de aprovar qualquer alteração de FK

- Deliberar política real de retenção de cada categoria e legal hold, incluindo critérios de anonimização e acesso, com validação jurídica/privacidade.
- Escolher regras `ON DELETE` definitivas e provar em PostgreSQL isolado que apagar empresa/integração **não remove** evidências protegidas.
- Revisar o SQL aditivo gerado, limites de migração, locks, integridade referencial, backup, restauração e estratégia de rollback **não destrutiva**.
- Conferir identidade e isolamento do runtime staging (pendência PR00), branch protection/CI e todos os demais gates de segurança. A `main` permanece intacta.
- Obter **autorização expressa e específica** antes de alterar schema, migrar Neon, executar deploy ou ativar integrações. O parecer pré-GO para código isolado não vale como autorização de publicação.

## Verificação automatizada desta fase

O workflow `PR01 - Local migration rehearsal (DISPOSABLE ONLY)` agora executa também o novo gate, compara a matriz com o inventário real de dez FKs do SQL sintético e gera `phase9-retention-release-hold.json` no artefato CI.

- **Check verde significa que o bloqueio de release está intacto.**
- **O relatório deve continuar `production_release_authorized: false`, `pending_decisions: 10`.**
- Se uma relação ou documento de política mudar silenciosamente, o check deve falhar.
- **Nenhum novo endpoint de exclusão**, worker, migration, deploy, merge ou configuração produtiva faz parte desta fase.

**Status final do ADR:** PROPOSTA. Sem decisões de retenção ou regras definitivas homologadas, o PR #627 permanece em Draft e a migração real continua bloqueada.
