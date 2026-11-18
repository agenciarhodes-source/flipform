# PR00 A2-C.13 — L1: CRM, pipelines, stages and tasks

Status: LABORATÓRIO APROVADO NOS CENÁRIOS TESTADOS — NÃO HOMOLOGADO PARA PRODUÇÃO.
Não realizar merge, deploy, migration ou aplicar este SQL em outros bancos.

## Escopo confirmado
- GitHub main: 6def5c5ed92920deadd0f83806f057da4219a022; schema Prisma oficial intacto.
- Neon project: flipform-staging-isolated / holy-fog-36254823, database flipform_staging.
- Nova branch auxiliar: pr00-a2c13-l1-crm-integrity-lab-20261117 / br-blue-dawn-bckyng6d; filha direta da A2-C.4 br-muddy-wind-bc07yc5d.
- Origem e cópia de recuperação br-wandering-violet-bcpf7orb conferidas antes de criar o laboratório: dois tenants, 14 registros sintéticos e checksums coincidentes.
- Staging principal br-icy-glitter-bcisq63l: zero tabelas, preservada. Nenhuma integração, dado real ou produção acessados.

## Prova de integridade no PostgreSQL 17
- Oito constraints no laboratório, todas validadas: 3 UNIQUE compostas, 3 FKs tenant composto e 2 FKs etapa/pipeline.
- Escopo tenant: leads.pipeline → pipelines, forms.pipeline → pipelines, tasks.lead → leads.
- Coerência: leads.stage_id + pipeline_id → pipeline_stages.id + pipeline_id; forms.initial_stage_id + pipeline_id → pipeline_stages.id + pipeline_id.
- Respeitadas ações ON DELETE RESTRICT nos vínculos leads/forms→pipelines, e ON DELETE CASCADE em tasks→leads, com ON UPDATE CASCADE nessas três FKs.
- EXCEÇÃO IMPORTANTE: FKs de etapa/pipeline experimentais usam ON UPDATE RESTRICT em vez de CASCADE do baseline, impedindo realocação de etapa em uso. Essa mudança demanda revisão funcional antes de qualquer release.

## Resultados de cenários sintéticos, sempre revertidos
| Cenário | Resultado |
|---|---|
| Lead A vinculado ao Pipeline B | FK rejeitou |
| Lead A vinculado à etapa B | FK rejeitou |
| Tarefa A vinculada ao lead B | FK rejeitou |
| Etapa A em uso realocada para Pipeline B | FK rejeitou |
| Formulário do Tenant A vinculado ao Pipeline B | FK rejeitou |
| Formulário do Tenant A com etapa do Tenant B | FK rejeitou |
| Formulário A com Pipeline A e Etapa A | Aceito |
| Tarefa A desvinculada do lead | Aceita |
| Mesmo Tenant A, outro pipeline A2: etapa A2 associada ao lead/form do pipeline A | Ambas rejeitadas |

O primeiro ensaio com pipeline A2 encontrou nome incorreto na coluna sintética (position em vez de order_index), foi revertido, corrigido e executado de novo com sucesso.
Todos os cenários usaram subtransação revertida; nenhuma alteração de lead, tarefa, formulário ou pipeline experimental foi persistida.
Checksums intactos: leads 82921cd235a03124a4b81f54df339e73; tasks 2568a229dc63a7e5460bc39575a235d1; stages 4c0953ddd5af92e210217c87016f921b.

## Camada aplicação: revisão estática e limites
Os endpoints de criação/movimentação de leads, CRUD de pipeline e etapas, formulário e tarefas vinculadas a lead foram inspecionados no commit base.
Verificações existentes incluem tenant da sessão, pipeline/etapa correspondente, RBAC e responsabilidade do atendente, e validação de lead por tenant em lib/tasks/team-task.ts.
Não é prova universal: escritas em APIs públicas, tarefas automáticas adicionais, jobs, raw queries e integrações exigem auditoria específica antes de qualquer aplicação.
Nenhuma alteração em app runtime ou prisma/schema.prisma neste PR de laboratório.

## Gates antes de liberação real
1. Revisar writers restantes, delete/ON UPDATE, concorrência, histórico e formularios; PR 01 continua bloqueado.
2. Reconciliar Prisma 5.22 com FKs compostas e controle de drift; preservar SET NULL parcial nas outras fases.
3. Definir plano de DDL faseada com backup, pré-validação agregada, locks e rollback, sem tocar dados reais antes de autorização específica.
4. Nenhum merge/deploy e nenhuma migration produzida nesta fase. Os PRs #619 e #620 permanecem experimentais.
