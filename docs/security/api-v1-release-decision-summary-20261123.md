# FlipForm API v1 — decisão final para início de publicação (PR #629)

**23/11/2026 — Pacote de decisão; NÃO É APROVAÇÃO.**
**Estado da API:** pronta para avaliação de lançamento controlado, porém **produção = NO_GO**.

## 1. Código pronto versus publicação autorizada

Os três PRs estão empilhados: **#627 (fundação M2M, base main) → #628 (sete endpoints de leitura, base #627) → #629 (homologação, base #628)**. Nenhum foi mesclado. O último commit de #629 antes deste documento, `e90f5f795affb3f9625f6b34143b98a7ed48db7f`, passou:
- compilação de tipos em todo o projeto, testes de autenticação M2M, scopes e leituras multi-tenant, testes executáveis da trava de transportes externos;
- preflight NO_GO, Gitleaks e Semgrep;
- anteriormente, cenários HTTP A/B sintéticos no preview protegido; 401 sem chave, 403 para escopo insuficiente, 404 em leitura de outro tenant, 200 para o próprio tenant e revalidação de 401 após revogação.

A API e a configuração pública de produção permanecem **OFF**. O preview protegido atual possui variáveis e JWT isolados, bloqueio programático de transportes conhecidos, nenhuma chave M2M de QA ativa. Isso **não prova isolamento universal de egress**; os dados de leads contêm IDs e datas pseudonimizados e vinculáveis.

## 2. Descoberta técnica sobre pedidos de exclusão

Leitura direta do código do mesmo stack:
- `POST /api/account/delete-request` exige proprietário/admin e a palavra `EXCLUIR`, **registra pedido em auditLog** e responde que a equipe revisará; não executa deleção física nesse handler.
- `PATCH /api/admin/lgpd` **registra o status da solicitação em auditoria** (`pending`, `in_review`, `processed`, `rejected`, `cancelled`). Não executa deleção física nesse handler e não registra prova obrigatória de expurgo técnico.
- `PUT /api/admin/tenants/[id]/status` altera status do tenant, registra histórico e auditoria, sem hard-delete nesse handler.
- `PATCH /api/integrations/api-v1/[integrationId]` permite `active`/`disabled` com checagem de proprietário/tenant; no fluxo administrativo API v1 o padrão é **desativar**, não eliminar as tabelas ou auditorias.
- As dez FKs novas do PR01 já usam `ON DELETE RESTRICT`, evitando destruição em cascata dessas evidências. Pode haver **incompatibilidade com processos de exclusão definitiva existentes**; revisar outros handlers/jobs antes de alterar regra de exclusão global.

**Implicação:** status `processed` em solicitação LGPD **não deve ser tomado como prova automática de anonimização/exclusão, nem como autorização de destruição de trilhas M2M**. A revisão humana precisa exigir evidência por caso (escopo, pendências, exceções legais, execução e auditoria de destinação). Este documento **não altera** esses endpoints nem impede o atendimento de solicitações legítimas.

## 3. Decisões de privacidade a serem aprovadas

Recomendação técnica conservadora, **sem bases legais ou prazos presumidos**:

| Grupo | Tabelas da API | Padrão técnico proposto | Deliberação externa necessária |
|---|---|---|---|
| Integração e credenciais | `api_v1_integrations`, `api_v1_credentials`, `tenant_entitlement_grants` | Desativar/revogar, preservar histórico necessário, nunca guardar segredo bruto | Finalidade, base legal, prazo após revogação, responsáveis, direitos dos titulares |
| Segurança e auditoria | `api_v1_credential_audits`, `api_v1_delivery_attempts` | Preservar evidências sem CASCADE; proteger acesso; nunca reter indefinidamente sem justificativa | Período justificado, legal hold, auditorias, destino final |
| Integridade de eventos | `api_v1_idempotency_records`, `api_v1_inbox_events`, `api_v1_outbox_events` | Não expurgar com retry, held, lease, DLQ ou investigação pendente | Horizonte de deduplicação, critérios de conciliação, retenção após encerramento |
| Segurança transitória | `api_v1_quota_buckets`, `api_v1_webhook_replays` | TTL só após fim da janela anti-abuso/anti-replay; execução auditada | Duração/limite mínimo e máximo, gatilho, revisão da política de legal hold |

**Revisor de privacidade/jurídico:** não definido.
**Prazos e bases legais aprovados para as dez categorias:** não definidos.
**Política formal de legal hold e direitos dos titulares:** não aprovada.
**Alteração do gate `retention_and_lgpd_approved`:** proibida sem evidência e aprovação humana expressas. Não aprovar automaticamente com um check verde.

## 4. Critérios operacionais restantes

- **Backup e restauração:** snapshots reais do esquema atual **102 tabelas, 356 índices e 139 FKs** restaurados em branch de laboratório, inclusive com três registros sintéticos, e `compare_database_schema` sem diferenças. **PITR por horário, RTO/RPO alvo, reconexão da aplicação e aprovação do plano de contingência** ainda pendentes.
- **Egress:** previews PR629 usam JWT e banco próprios; e-mail desativado; Meta, Google, Instagram, WhatsApp, Stripe, SMTP/Resend têm trava código **somente no preview**. Falta comprovação total de egress por meio de medições de runtime e inventário completo de SDKs, jobs e variáveis de ambiente.
- **Rollback:** manter chave-mestra global da API desativada e revogar chaves; deploy OFF novo em caso de incidente; não reverter schema via `DROP` em produção. Plano documentado, mas sem aceite operacional produtivo.
- **Quatro workflows de manutenção Disabled:** manter assim, a menos que haja demanda e autorização específicas.
- **API V1:** rotas atuais focadas em leitura M2M; integração de escrita e outras capacidades futuras NÃO estão incluídas nesta aprovação.

## 5. Decisão de publicação — três autorizações explícitas e separadas

**A. Privacidade** — Responsável nomeado aprova por tabela: finalidade, base legal, período/evento de contagem, legal hold, descarte, escopo de pedidos LGPD e coexistência com os handlers de exclusão existentes. Registrar referência auditável no workbook e ADR sob revisão.

**B. Operação e risco** — Responsável aceita RPO/RTO e restauração, modelo de isolamento runtime/egress, evidências de rollback e exposição de endpoints/tenants piloto. Ausência de evidência exige manter `NO_GO`, não marcar aprovação por inferência.

**C. Lançamento** — O proprietário autoriza especificamente a sequência de merges **#627, #628, #629**, migração aditiva após backup e verificação do destino Neon produtivo, deployment produtivo **com API OFF**, verificação 404, e ativação gradual **de um tenant piloto por vez** (não global nem automática), com indicadores e rollback pronto. Não confundir `checks passed` com esta autorização.

**Assinaturas/referências e datas:** em aberto. **Resultado:** sem aprovações A+B+C, `NO_GO`, sem merge ou rollout produtivo. A conclusão técnica do desenvolvimento não equivale à publicação.

## 6. Leituras técnicas usadas
- `docs/security/api-v1-retention-decision-workbook-20261122.json`
- `docs/security/pr01-phase9-retention-decision-matrix.json`
- `docs/security/api-v1-pitr-egress-review-20261122.md`
- `docs/security/api-v1-homologation-runbook-20261121.md`
- `app/api/account/delete-request/route.ts`
- `app/api/admin/lgpd/route.ts`
- `app/api/admin/tenants/[id]/status/route.ts`
- `app/api/integrations/api-v1/[integrationId]/route.ts`

**Este documento é recomendação de procedimento técnico e não substitui revisão jurídica/privacidade nem autorização de produção.**
