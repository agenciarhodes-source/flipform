# PR01 — Fase 8 | Ensaio local de migration, rollback e riscos de cascata

**19/11/2026 · PR #627 · branch `feature/pr01-global-api-foundation` (Draft).**

## Escopo e decisão

Fase 8 executa somente **no GitHub Actions, com banco PostgreSQL descartável local `pr01_rehearsal`**. Não está autorizada migration em Neon, staging, produção, qualquer banco de cliente ou Vercel. Nenhuma branch foi integrada à main; a API e os processadores reais continuam OFF.

### Procedimento testável no workflow

1. Checkout da branch do PR e do SHA exato de base da `main`, sem persistir credenciais.
2. Reconstituir `baseline.prisma` do commit base. Gerar SQL de 92 modelos a partir de um datamodel vazio e SQL **aditivo** de 92 → 102 modelos pelo Prisma 5.22.
3. Revisar o SQL offline com `pr01_offline_sql_diff_audit.py`, que rejeita `DROP`, `ALTER` em tabelas da baseline, `CREATE TYPE` não aprovado e operações de dados.
4. Inventariar 10 FKs e suas regras `ON DELETE`, gerando `cascade-risk-report.json`, explicitamente **não homologado para produção**.
5. Criar um banco **novo**, exclusivo no runner do GitHub, e instalar a extensão pgvector local. Validar as URLs e os três gates simultâneos `CI=true`, `GITHUB_ACTIONS=true`, `PR01_LOCAL_REHEARSAL=true`.
6. Aplicar o SQL da **baseline apenas nesse banco descartável**, conferir 92 tabelas, inserir um tenant de sentinela **fictício** e registrar sua presença.
7. Aplicar o diff PR01 **nesse mesmo banco descartável**, confirmar exatamente 102 tabelas, preservação do tenant preexistente e 10 FKs em cascata.
8. Criar tenant/integration/audit **sintéticos**, excluir somente esse tenant fictício e confirmar o risco: seu registro de auditoria desaparece pela cascata. O tenant de sentinela continua intacto.
9. **Ensaio de rollback estritamente local**: rejeitar se qualquer tabela PR01 contiver linhas; usar exatamente 10 `DROP TABLE` explícitos na ordem de dependência inversa, sem `CASCADE` e em transação única. Conferir retorno às 92 tabelas e preservação do tenant de sentinela.
10. Publicar no GitHub somente artefatos de diagnóstico (SQL de teste, inventário de FKs, relatório e checksums), **nunca comandos para executar em Neon**.

O ensaio da reversão pressupõe **tabelas novas vazias**. Em ambiente real com dados já gravados, `DROP TABLE` não seria reversão aceitável. O rollback de produção permanece **não definido** e necessitará snapshot/restore aprovado, plano forward-fix, período de compatibilidade e autorização específica.

## Inventário de efeitos `ON DELETE CASCADE` — exige decisão

| Filho PR01 | Pai | Impacto de apagar o pai |
|---|---|---|
| `api_v1_integrations` | `tenants` | Exclui configurações de integração |
| `api_v1_credentials` | `api_v1_integrations` | Exclui credenciais |
| `tenant_entitlement_grants` | `tenants` | Exclui histórico de concessões |
| `api_v1_credential_audits` | `tenants` | **Exclui a trilha de auditoria** |
| `api_v1_quota_buckets` | `api_v1_credentials` | Exclui contadores e evidências de consumo |
| `api_v1_idempotency_records` | `api_v1_integrations` | Exclui provas de idempotência |
| `api_v1_inbox_events` | `api_v1_idempotency_records` | Exclui eventos recebidos |
| `api_v1_outbox_events` | `api_v1_inbox_events` | Exclui eventos aguardando envio |
| `api_v1_webhook_replays` | `api_v1_integrations` | Exclui prova de rejeição de replay |
| `api_v1_delivery_attempts` | `api_v1_outbox_events` | Exclui histórico de tentativas/DLQ |

A árvore de cascata pode ser **indireta** e extensa. Hoje não existe decisão aprovada sobre `RESTRICT`, `NO ACTION`, arquivamento independente, retenção mínima, expurgo LGPD ou guarda legal. A demonstração no banco sintético serve para evidenciar o risco, **não para autorizar a exclusão em produção**.

## Gates e próximas decisões

- Aprovar ADR de preservação de auditoria, retenção por categoria de dado e fluxo explícito de exclusão de tenant/integração (bloqueio ou descarte auditado).
- Revisar consequências de `onDelete: Cascade` em casos de pedido de exclusão LGPD e legal hold, incluindo chaves M2M e evidências de segurança.
- Comparar o schema e o catálogo do **banco-alvo real** sem escrita quando houver autorização; diferença do `main` não prova identidade do Neon em runtime.
- Registrar backup, janela de manutenção, rollback real não destrutivo, estratégias de reparo, compatibilidade de versões, métricas e aceites antes de qualquer migration.
- Revalidar proteções PR00/PRs #623–#626, branch protection/CI e workflows desativados separadamente.
- **NO-GO permanece para merge, deploy, Neon, dados reais, API ativa, integrações e workflows de reparação.** O workflow PR01 faz apenas exercícios com dados totalmente fictícios em banco efêmero.

Os testes e os relatórios da Fase 8 não constituem autorização de release, mesmo se CI/Playwright/Semgrep/Gitleaks estiverem verdes.
