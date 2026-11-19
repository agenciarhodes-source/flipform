# PR 00 → PR 01 | Decisão de prontidão e autorização técnica condicionada

**Data:** 19/11/2026 · **Referência vinculante:** Plano Mestre Pollo OS v6.1, de 16/11/2026, seções 00A.2–00A.5 / PRs 00–02.  
**Natureza:** parecer técnico e preparação de aprovação, não execução. **Não autoriza implementação, criação de branch de código, merge, deploy, migração, execução de workflow de reparação, uso de credenciais reais ou acesso a dados de clientes.**

## 1. Veredito — duas decisões independentes

| Decisão | Parecer técnico atual |
|---|---|
| **Planejar/contratar API PR01** | **GO — CONCLUÍDO**. Handoff detalhado: `docs/security/pr00-pr01-global-api-handoff-20261119.md`. |
| **Autorizar codificação em branch Draft isolada** | **GO TÉCNICO CONDICIONADO**, sujeito à aceitação formal dos riscos PR00 e autorização expressa do proprietário. Só código/contratos/testes sintéticos offline; nenhuma credencial, dado real, deployment ou merge. Não afirmar PR00 integralmente homologado. |
| **Rodar nova API no Preview/staging com gravações de dados** | **NO-GO** até egress/webhooks/crons e identidade runtime serem comprovados e ambiente descartável de dados sintéticos aprovado. |
| **Merge em `main` ou deployment produtivo** | **NO-GO** até aceite dos testes da API, revisão dos riscos remanescentes, documentação de rollback e autorização específica separada; PRs legados não são automaticamente mesclados. |
| **Reativar workflows de reparação de produção** | **NO-GO**. Proteção #623 ainda só em Draft; os quatro workflows devem permanecer Disabled. |

**Interpretação:** o código da API pode ser desenvolvido, após autorização individual de implementação, sem ativá-la e sem liberar qualquer componente produtivo. O Plano Mestre condiciona o início da codificação ao fechamento ou aceite explícito dos gates PR00 aplicáveis. A proposta de GO técnico condicionado **não equivale a esse aceite do proprietário**.

## 2. Evidências verificadas agora (sem SQL de produção)

- Repositório privado `agenciarhodes-source/flipform`, default `main`, `allow_auto_merge=false`. Os PRs **#619, #620, #621, #622, #623, #624, #625 e #626** permanecem Draft e não mesclados; **CI e Playwright E2E `success`** em seus HEADs (a auditoria Prisma offline está skipped, não executada).
- Vercel projeto produtivo **`flipform`**, ID `prj_7CWjG34Zspu7iUrhXweIKR0uNG0v`; deployment Production recente `dpl_EBz4fK3MG8uidSzWSpRBZw4QQGYp`, READY, commit `6def5c5ed92920deadd0f83806f057da4219a022`.
- Vercel projeto isolado **`flipform-staging`**, ID `prj_UOvo8lKGiIvp7IuBS4vtL9CnSZIu`; deployment Production do **projeto staging** `dpl_gXw1pmHztnKtFieJ5BPi7dSg4QT5`, READY no mesmo commit de aplicação. Ter o mesmo commit NÃO significa ter o mesmo banco: projetos e variáveis são distintos.
- Nomes de env no projeto staging (sem decriptar): **somente** `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET_CURRENT`, `JWT_SECRET_PREVIOUS`, para targets preview/production **do staging**. O projeto produtivo tem 50 variáveis de app/integrações. A ausência de secrets de integração no staging **não prova** que todas as chamadas de saída/crons estão bloqueados pelo código.
- Neon produtivo `leadflow-crm` (`royal-truth-23388416`), branch default protegida `production` (`br-round-morning-apjwfg61`). Neon separado de staging `flipform-staging-isolated` (`holy-fog-36254823`), branch `staging` (`br-icy-glitter-bcisq63l`). Ambos os projetos confirmados diferentes. O Preview de #626 comprovou destino `current_database/current_user` **no build**, ainda não no runtime serverless.
- Código `main`: `lib/rate-limit.ts` retorna fallback em memória quando a checagem DB falha; `lib/platform-audit.ts` tenta selecionar tenant arbitrário sem `tenantId`. **Proibir ambos os padrões no novo código da API**.
- Catálogo em `lib/billing/plan-catalog.ts`: `premium` ativo, `premium-pro` com `isActive: false`, `inbox` plano especial ativo; são **dados do catálogo do código**, não prova do plano contratado de cada cliente. `lib/billing/group-plan.ts` reflete assinaturas entre lojas do grupo e exige política explícita para grants de API. `lib/rbac.ts`: `INTEGRATIONS_VIEW/MANAGE/EDIT` permitem `owner/admin`; `SETTINGS_MANAGE` é só owner. **Política final para emissão/revogação de chaves M2M ainda não foi homologada**, e não pode ser inferida apenas de `INTEGRATIONS_MANAGE`.

### Limitações de visibilidade nesta consulta

O conector GitHub usado nesta sessão **não expõe leitura do status `enabled/disabled` dos workflows nem a configuração completa de rulesets/required checks e reviewers**. A desativação dos quatro workflows, o Environment `production-maintenance` e `MAINTENANCE_GATE=disabled` foram confirmados em evidências anteriores registradas no PR #623, **não revalidados em tempo real nesta consulta**. Não apresentar o status atual da UI como auditado novamente. Antes de qualquer reativação/merge crítico, a verificação da UI/ruleset deve ser refeita; ela não impede escrever contratos/CI offline do PR01.

## 3. Matriz dos riscos residuais: START vs RELEASE

| ID | Nível | Risco concreto | Gate para iniciar código PR01 em branch isolada | Gate para staging/merge/produção |
|---|---|---|---|---|
| R01 | CRÍTICO | Isolamento tenant A/B e FKs tenant-safe não comprovados integralmente para API | Documentar tenant como derivado exclusivamente da credencial, sem confiança em `tenantId` do payload; testes A/B obrigatórios | Testar no PostgreSQL sintético todos os reads, writes, jobs, eventos, webhooks e cruzamento de IDs; sem testes não publicar |
| R02 | CRÍTICO | `#623` guard de reparação não mesclado; main contém quatro YAML de workflow de reparação **sem** `MAINTENANCE_GATE`/secrets exclusivos | Manter 4 Disabled; sem segredo exclusivo; não disparar workflow | Review + integração específica do guard, environment e identidade de destino, rollback e autorização por operação; reabilitar só depois, **sem acionar reparo** |
| R03 | CRÍTICO | Staging: conexão correta comprovada somente no build; egress/crons/integrações não homologados | **Somente CI/local descartável** para PR01, sem deploy de runtime nem env secrets externos | Controle de outbound, jobs e webhooks; conexão real de runtime e banco de teste; flags off; autorização de deployment específica |
| R04 | ALTO | #624 links históricos sem aliases aprovados; possível 404 em campanhas após merge | Não mesclar #624, não tocar resolvedor ao desenvolver PR01 | Inventário comercial auditado e aliases/compatibilidade aprovados antes de **publicar #624**; não reabrir auditoria repetitiva de source |
| R05 | ALTO | #625 tem CAS em Draft, mas corrida simultânea e rollback reais ainda não homologados | PR01 não alterar caminho atual de movimentação de leads; testes de API sintética separados | Corrida multi-conexão sintética, arquivamento concorrente, história/auditoria e regressão antes de integrar PR625/caminhos afetados |
| R06 | ALTO | Catálogo Premium Pro inativo, plano Inbox independente, grupos e exceção Junqueira | Definir ADR de entitlements: Premium; Premium Pro somente se válido; Inbox não herda API; exceção por grant de tenant explícito | Verificar backend contra catálogo, subscription, group payer e grants; teste negativo de papéis, plano vencido/bloqueado |
| R07 | ALTO | RBAC atual `INTEGRATIONS_*` para owner/admin não equivale a direito de criar API key | Especificar permissão de credenciais separada e escopos aprovados; nenhuma chave real emitida | Testes owner/admin/manager/agent/viewer e platform_admin com grants auditados, revogação/rotação |
| R08 | CRÍTICO | Fallback permissivo em `lib/rate-limit.ts` para acesso externo de escrita | Proibir importação cega do limiter para escrita M2M; projetar rate limit distribuído fail-closed | Falha de DB/rate store -> escrita negada, teste de carga/concorrência e limites por tenant/integration/route |
| R09 | ALTO | Auditoria `lib/platform-audit.ts` permite escolher tenant quando ausente | Exigir tenantId validado em toda auditoria da API | Testes de missing tenant, ausência de PII/secret, correlation ID, retenção |
| R10 | ALTO | Inbox/outbox M2M, idempotência e assinatura de webhooks não implementadas | ADRs, índices compostos e handlers desabilitados por padrão | 10 retries -> 1 efeito; payload divergente 409; HMAC/tempo/replay/SSRF, fila durável, DLQ, observabilidade |
| R11 | ALTO | Recuperação: snapshot sintético existe, mas RPO/RTO e restore produtivo não homologados | Trabalho somente offline/aditivo; sem migrations reais | Plano de restauração e rollback medidos/revisados antes de alterações que afetem banco produtivo |
| R12 | ALTO | Verificação atual de ruleset/reviewer de `main` incompleta e `npm audit` como `continue-on-error` no CI | Branch Draft, sem merge, sem auto merge; declarar evidência não comprovada | Reconfirmar required checks/proteção real e política de auditoria de dependências antes de merge |
| R13 | CRÍTICO | Eventos da API poderiam contaminar atribuição Google/Meta ou disparar envios externos | Eventos de integração são distintos de eventos publicitários por contrato; nenhuma chamada a Ads/Pixel no PR01 | Testes sintéticos com mocks bloqueando envio Meta/Google/WhatsApp/Stripe; nenhum efeito em canais reais |

**Gravidade é avaliação de risco para planejamento, não resultado de pentest nem certificação.** Todos os campos de aceitação do PR01 estão pendentes porque a API ainda não foi codificada; não confundí-los com defeitos já comprovados.

## 4. Registro explícito dos quatro workflows de reparação

| Workflow GitHub | Código atual na `main` | Guard Draft #623 | Estado operacional a preservar |
|---|---|---|---|
| `Repair Production Schema` | Workflow manual sem `MAINTENANCE_GATE` | `production-maintenance` + allowlist de banco + segredo dedicado + confirmação | **Disabled**, último registro da UI; não ativar |
| `Repair Team Hierarchy Schema` | Workflow manual sem guard | Mesmo guard + confirmação | **Disabled**, não ativar |
| `Repair WhatsApp Cloud Schema` | Workflow manual sem guard | Mesmo guard + confirmação | **Disabled**, não ativar |
| `Repair Business Group Schema` | Workflow manual sem guard | Mesmo guard + confirmação | **Disabled**, não ativar |

**Regra de reativação futura, nesta ordem**: (1) revisão e merge explícito das proteções aprovadas do #623, com testes e diff do workflow; (2) verificar Branch Environment `production-maintenance`, `main`, allowlist de host/banco/role, exclusividade e existência dos secrets dedicados **sem mostrá-los**; (3) manter `MAINTENANCE_GATE=disabled` por padrão; (4) homologar responsabilidade e recuperação; (5) receber autorização específica para reativar cada workflow; **reativar não é executar**. Não reabilitar simultaneamente como efeito da publicação de PR01.

O PR #623 registra que `PR00_MAINTENANCE_DATABASE_URL` e `PR00_MAINTENANCE_DIRECT_URL` continuam ausentes e que não existe segundo aprovador independente homologado. **Não criar esses segredos agora**, nem ativar gate por planejamento da API.

## 5. Limites objetivos da autorização de implementação a solicitar

**Permitido SOMENTE após manifestação expressa do proprietário:**
- Criar branch e PR **Draft** do PR 01, sem merges automáticos.
- Desenvolver **código de fundação e contratos** `/api/v1`, modelo de credenciais, escopos, auth M2M, quotas, idempotência, outbox/inbox, assinatura, flags OFF, admin UI, OpenAPI e testes, respeitando ADRs e revisão.
- Executar testes offline/CI com PostgreSQL **descartável**, dados fictícios e nenhum segredo ou conexão Neon produtiva.
- Fazer commits em branch separada e corrigir CI, sem mesclar em `main`.

**Fora desta autorização, exige autorização distinta posterior:**
- Migration/DDL/DML em Neon staging ou produção, `prisma migrate deploy`, aplicar schemas, usar dados reais, emitir chaves reais, provisionar tokens, habilitar env flags, abrir endpoints públicos para usuários/clientes.
- Deploy staging, Preview acessível ao público com integrações, alterações em ads/pixels/webhooks/Stripe/WhatsApp, reativação de workflows, fusão de PR ou deploy produção.
- Implementar CRUD, importador de ERP ou mapeamento de pipelines do PR 02.

## 6. Pacote pronto para próximo turno (não executar automaticamente)

**Entrada para PR 01:**
- Repositório `agenciarhodes-source/flipform` · base `main` atual a registrar no início · nova branch futura sugerida `feature/pr01-global-api-foundation` (não criada).
- Referências: Plano Mestre v6.1; `docs/security/pr00-pr01-global-api-handoff-20261119.md`; este documento; PRs Draft #622–#626 como evidências, **não como código automaticamente mesclado**.
- Proposta inicial de diff (somente se autorizado): `docs/api/openapi-v1.yaml`, `docs/security/pr01-adrs.md`, `lib/api-v1/{auth,entitlements,limits,errors,idempotency,events,webhooks}.ts`, `app/api/v1/*` com flag OFF, modelos Prisma aditivos e testes unitários/integrados; caminhos finais a confirmar no review. Evitar tocar `app/api/leads/route.ts`, Ads/Pixel ou workflows de reparação.
- Primeiros testes: tenant A/B e grupo; revisão de papéis; chave expirada/revogada; missing critical limiter -> fail-closed; evento 10x com fingerprint; HMAC e replay; SSRF/redirect; sem tráfego externo/PII; desligamento de flag e ausência de side effects.
- **Risco de dependência entre branches:** PR #625 possui correção de concorrência e PR #624 reescreve gerador de URLs, mas ambos estão Draft. Não rebasing/merging dessas branches automaticamente no PR 01.
- Políticas de liberação: PR 01 Draft inicialmente, CI/Playwright, revisão de código e segurança e autorização separada para cada merge/deploy.

**Parecer formal:** `PRE-GO` limitado a codificação offline em branch isolada **após** consentimento expresso e aceite/documentação dos riscos de entrada; `NO-GO` para runtime staging real, merge e produção. Não afirmar que os 13 riscos foram solucionados: cada gate de release permanece controlado e rastreável.
