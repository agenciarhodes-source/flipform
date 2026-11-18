# PR00 — A2-C.14 | Auditoria dos caminhos de escrita do L1

**GATE: NÃO HOMOLOGADO PARA PRODUÇÃO. Documento de auditoria (read-only), não um patch funcional.**
**Data:** 17/11/2026. **Base verificada:** `agenciarhodes-source/flipform` main `6def5c5ed92920deadd0f83806f057da4219a022`. Prisma 5.22.0, 92 modelos. Não houve consulta a dados reais.

## Objetivo e limites

Inventariar e priorizar os caminhos de escrita que interferem no lote L1 (leads, pipelines, etapas, tarefas e, na fronteira L2, formulários públicos). A2-C.13 provou constraints experimentais em banco isolado, mas elas **não estão na main e não substituem validações da aplicação**.

O GitHub contém 266 rotas API, 22 rotas de leads, 6 rotas de pipeline, 4 rotas de formulário, 8 cron/jobs, 5 webhooks, 180 arquivos de biblioteca candidatos e 18 scripts TypeScript. O rastreamento por código-fonte revisou os fluxos relevantes e os pontos de persistência identificados; **não significa inspeção linha a linha de todas as 266 rotas nem certificação de cobertura completa**. Cada chamado indireto ou código adicionado após o SHA de base requer reavaliação.

## Resultados prioritários (todos são achados de leitura de código, não provas de vazamento em dados reais)

### P0 — Formulário público: identidade da empresa não é inequívoca

- O banco aceita slugs iguais em empresas diferentes, conforme `prisma/migrations/20260617120000_tenant_scoped_form_slugs_and_domain_readiness/migration.sql`: UNIQUE `(tenant_id,slug)`.
- O gerador de slug `lib/forms/generate-unique-form-slug.ts` consulta apenas o tenant.
- A página `app/f/[slug]/page.tsx` e `app/api/public/forms/[slug]/route.ts` fazem `findFirst` por `slug` sem tenant. O POST `app/api/public/forms/[slug]/submit/route.ts` aplica filtro de tenant apenas quando encontrou domínio personalizado verificado; com host padrão ou não reconhecido a consulta se reduz a slug.
- Links padrão gerados em `lib/forms/public-form-url.ts` usam `https://app.flipform.com.br/f/{slug}`, sem identificador público do tenant; a página personalizada `app/custom-domain/[slug]/page.tsx` **usa corretamente o tenant do host verificado**.
- **Impacto potencial:** dois tenants com o mesmo slug podem ter links padrão indistinguíveis, e GET/página/POST podem selecionar formulário de tenant inesperado. Não afirmar que dados reais foram direcionados erroneamente sem teste/observação.
- **Resolução proposta:** identificador público canônico estável na rota padrão (por exemplo ID opaco do formulário mais slug para legibilidade), resolutor compartilhado página/API/POST, tenant derivado apenas do host verificado ou ID canônico, fail-closed para slug legado ambíguo e host não reconhecido. Compatibilizar links antigos sem alterar pixels/Ads e sem inferir tenant por cliente.

### P0 — TOCTOU nas movimentações manuais e automáticas

- `app/api/leads/[id]/move/route.ts` e `lib/leads/move-stage.ts` leem lead e etapa com tenant/pipeline corretos, **mas atualizam por ID depois**, em uma transação iniciada após a leitura; alterações concorrentes podem invalidar estágio anterior e histórico.
- **Resolução:** comparar atomicamente `tenantId`, `pipelineId`, `stageId` anterior e condições aplicáveis no UPDATE (ou `SELECT ... FOR UPDATE` em transação); inserir histórico apenas após sucesso inequívoco. Se concorrência, responder 409 sem gerar tracking. Eventos de Meta/Google permanecem fora do escopo de modificação.

### P0 — Movimento em lote e undo pelo Assistente de Leads

- `lib/lead-assistant/service.ts` recalcula movimentos em transação, mas `updateMany` inclui tenant/status/IDs sem comparar stage anterior e pipeline em cada registro. Histórico, auditoria e batch contabilizam todos os movimentos planejados, sem verificar `count` retornado.
- `undoLeadBatch` compara estado numa leitura e depois atualiza por tenant/id, sem comparador atômico no momento do UPDATE.
- **Resolução:** CAS/locks, controle da contagem efetiva, rollback integral se stale, histórico somente para linhas alteradas e undo sem sobrescrever mudanças humanas posteriores.

### P1 — Demais caminhos e tarefas

- `app/api/pipelines/[id]/stages/[stageId]/route.ts`: contagem de leads antes de arquivar; o `is_archived` não é protegido por FK. Exige teste de concorrência com criação/movimento de leads.
- `app/api/leads/transfer-portfolio/route.ts` e `lib/flip/suggestions.ts`: seleção do responsável atual e posterior `updateMany` sem comparar `assignedTo` original; logs podem refletir plano e não alterações efetivas.
- `lib/whatsapp-ai/stage-suggestions.ts`: aprovação de sugestão consultada como pending, movimento e atualização de status separados; concorrência requer claim atômico e idempotência.
- `app/api/public/forms/[slug]/submit/route.ts`: configurações de formulário carregadas antes da criação transacional; revalidar ativação e etapa dentro da transação.
- Tarefas: `lib/tasks/team-task.ts`, `lib/instagram-ai/handoff.ts`, `lib/flip/suggestions.ts`, `lib/flip-ai/human-action-request.ts`. Verificações tenant/lead existem em caminhos revisados; manter FK `(lead_id,tenant_id)` no DB e validação de destinatário ativo.
- `scripts/mark-final-stage-leads-won.ts` permite operar sem `--tenant` e por isso tem escopo operacional multiempresa; não executar scripts nem modificar a CLI sem gate separado.
- Exclusões de pipelines/etapas têm checagens prévias, e FKs RESTRICT são defesa adicional; tratar colisões de concorrência como 409, não deletar registros para 'consertar' falhas.

## Salvaguardas observadas que devem ser preservadas

- `lib/leads/ensure-from-conversation.ts` trava conversa e tenant via `FOR UPDATE`, verifica lead, pipeline e etapa no tenant; `lib/automation/handlers/lead-move-stage.ts` trava conversa e lead antes da movimentação.
- `lib/form-duplicate-lead.ts` utiliza advisory lock transacional segregado por tenant e contato; `lib/lead-assignment.ts` usa `FOR UPDATE` e memberships ativos no tenant.
- `app/api/leads/route.ts` e rotas de tarefas verificam sessão e permissões; usuário pode ser global, mas atuação da equipe é delimitada por `tenant_users`.
- A2-C.13 validou 8 constraints com 2 tenants fictícios, 6 negativas, 2 positivas e coerência do mesmo tenant/outro pipeline; dados experimentais revertidos.

## Matriz executável de priorização

Ver `docs/security/pr00-a2c14-l1-writer-risk-register.csv` para 12 achados com caminhos, linhas, impacto potencial e regressões esperadas.

## Sequência recomendada de correções (nenhuma executada nesta etapa)

1. **A2-C.15/P0:** contrato público único de identificação de form/tenant, compatibilidade dos links legados e testes sintéticos de slug duplicado. Não tocar Ads/Pixel e não acessar leads reais.
2. **A2-C.15/P0:** CAS transacional e integridade do histórico de movimentação manual, IA e Assistente; testes concorrentes em banco efêmero.
3. **A2-C.15/P1:** arquivamento, transferência de carteira, sugestões e criação de tarefas idempotentes; isolamento por RBAC e tenant.
4. Reinspecionar todos os writers e caminhos indiretos e combinar com constraints do PostgreSQL do L1; comparar Prisma introspection/drift. Nenhuma migration é autorizada.
5. Antes de implantar: read-only audit agregado autorizado, matriz de compatibilidade, backups, janela de locks, rollback testado, política de deploy sem Prisma migrate deploy em produção. Bloqueio de PR 01 até concluir gates.

## Regras de PR e segurança

- PR de auditoria **Draft**, sem código runtime, sem schema, sem migrations, sem comandos para rodar SQL em banco. `vercel.json` desabilita previews da branch desde o primeiro commit.
- CI verde de documentação não deve ser confundido com correção das vulnerabilidades. P0 deve permanecer aberto até testes de integração aprovados.
- PRs #619, #620 e #621 seguem sem merge. PR 01 continua bloqueado.
