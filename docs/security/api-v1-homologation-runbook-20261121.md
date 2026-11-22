# FlipForm API v1 — homologação concentrada PR01 + PR02 (21/11/2026)
**Estado apurado: NO-GO para staging de código atual e produção. Este documento não concede autorização de release.**

## Escopo e hierarquia
- #623 PR00: manutenção/segurança. Mantido Draft, quatro workflows de reparo Disabled e `MAINTENANCE_GATE=disabled`.
- #627 PR01: identidade M2M multiempresa, entitlement, chaves, quota, retenção, idempotência e integridade de eventos; Draft, CI aprovado.
- #628 PR02: APIs de leitura de pipelines, formulários, definição de campos, métricas por etapa, lista/detalhes de metadados de leads; Draft, CI e Playwright aprovados. A base do PR02 é a branch do PR01.
- PR único de homologação: **empilhado sobre #628**; inclui somente preflight, evidências e procedimento. Não reimplementa API nem muda esquema.

## Evidências diretas — somente leitura
Os detalhes com origem, data e indicadores booleanos estão em `api-v1-homologation-evidence-20261121.json`.
- GitHub: CI de #627 e #628 concluído com `success`; PRs Draft. Os checks de migração de #627 exercitam **PostgreSQL local descartável**, não o runtime de staging.
- Neon: projeto isolado `flipform-staging-isolated`, branch `staging`, DB `flipform_staging`. Consulta SQL `pg_tables` encontrou **0 tabelas públicas**, 0 `api_v1_*` e 0 FKs da API neste banco; não é um staging com esquema FlipForm.
- Vercel: projeto `flipform-staging` e envs **nomes** `DATABASE_URL`/`DIRECT_URL` presentes (metadados apenas, sem leitura de valores). Deployments `READY` analisados pertencem à branch anterior `security/pr00-a2d-staging-db-attestation-20261118`, **não** ao HEAD #628.
- Existência de snapshots do Neon criados em 17/11 **não comprova** recuperação da versão atual. Nem host de runtime, nem isolamento de egress, nem rota M2M ao vivo foram atestados.
- `docs/security/pr01-staging-release-gates-DRAFT.json` continua `NO_GO` e `docs/security/pr01-phase9-retention-decision-matrix.json` tem 10 decisões `PENDING`. As dez FKs da API em Draft são `RESTRICT` no inventário; nenhuma política definitiva de retenção/legal hold foi aprovada.

## Caminho único de aceite (sem novos PRs de inventário)
1. **Decisão de privacidade:** responsável aprova por categoria os fins, base legal, visibilidade de IDs relacionáveis, prazo de retenção, atendimento ao titular, legal hold e destino de auditorias/DLQ. Revisar compatibilidade das dez FKs `RESTRICT` com fluxos existentes de deleção. Não alterar flags `NO_GO` apenas para passar CI.
2. **Autorização específica de staging (posterior):** identificar explicitamente projeto Neon/branch, banco, role, deployment Vercel, hash aprovado e procedimento de rollback. Conferir que nenhuma credencial pode atingir produção, e que webhooks/jobs/integrações externas/Ads ficam isolados.
3. **Bootstrap não destrutivo em ambiente descartável:** a branch padrão `staging` está vazia. Com autorização, gerar esquema de aplicação a partir do commit fixado em *nova branch Neon descartável*, validar DDL de 92+10 tabelas e integridade, restaurar snapshot correspondente e guardar hashes/horário; **não** usar scripts `db push`/migrate em banco de produção. Não apagar a branch staging existente.
4. **Deploy controlado ao staging separado:** somente com autorização de staging, implantar commit exato em preview sem expor domínio público não protegido; deixar `FLIPFORM_API_V1_ENABLED=false` e `MAINTENANCE_GATE=disabled`. Fazer a atestação DB pelo **runtime** (não pelo build/runner), incluindo DB/role/host não sensível em canal de evidência restrito, sem segredos.
5. **Egress/recuperação:** executar testes controlados que provem ausência de saída para Meta/Google/webhooks reais, verificações de não vazamento em logs, backup/restore no esquema recém-criado com RPO/RTO medidos, e estratégia de forward-fix/rollback.
6. **Regressão de isolamento A/B:** com empresas e chaves sintéticas e prazo curto, provar 401 ausente/revogado, 403 escopo/plano/tenant suspenso, 404 recurso de outro tenant, 429 quota, paginação e 503 falha de dependência. A leitura de metadados dos leads é pseudônima, não anônima. Nenhum dado real deve ser usado.
7. **Aprovação separada:** com relatórios verificáveis, revisão técnica/privacidade e autorização expressa, reavaliar gates de staging. Só então avaliar a sequência de merges #627 -> #628 -> PR de homologação; depois autorizar migração produtiva, deploy gradual e ativação por tenant em procedimento próprio. CI verde **não** libera automaticamente.
8. **Workflows de manutenção:** permanecem Disabled, independentemente do aceite da API. Sua reativação tem homologação e autorização próprias, isoladas do rollout da API.

## Critério objetivo de encerramento
- **Preparação de homologação concluída:** preflight offline passa, relatório de descoberta arquivado, riscos e sequência de execução documentados em um único PR.
- **Homologação integral concluída:** depende de evidência nova de runtime, migração isolada, egress, backup/restore, A/B e aprovação de privacidade; **não obtida em 21/11/2026**.
- **API disponível para clientes:** requer um `GO` separado de release e execução controlada, atualmente inexistente.

## Comandos offline seguros
```bash
python3 -m unittest discover -s tests -p test_api_v1_homologation_preflight.py -v
python3 scripts/api_v1_homologation_preflight.py --report /tmp/api-v1-homologation-preflight.json
```
Nenhum dos comandos acima altera Neon, Vercel, GitHub Actions ou dados de clientes.

## Progresso desta etapa — branch descartável preparada (21/11/2026)
- No projeto Neon separado `holy-fog-36254823` (`flipform-staging-isolated`), criada e conferida a branch **`api-v1-pr629-homologation-lab-20261121`** (`br-nameless-art-bc6k4c5g`), filha de `staging` (`br-icy-glitter-bcisq63l`).
- O estado da branch foi consultado e retornou `ready`. Ela **não** é a default nem é protegida; foi criada **sem compute** para não ligar recursos de processamento sem necessidade. Não recebeu schema, fixtures, migrations, chave nem deployment.
- Uma primeira tentativa de criar compute com timeout de suspensão de 60 s foi recusada com HTTP 412 devido às condições do plano; não houve compute nessa tentativa. A criação posterior sem compute funcionou.
- Os metadados do projeto Vercel staging continuam listando `DATABASE_URL` e `DIRECT_URL` como `sensitive`. A consulta com pedido de descriptografia retornou `decrypted: false`; valores em branco **não provam que as variáveis estejam vazias**. Não houve leitura do host ou do segredo; identidade do runtime continua pendente.
- O script de preflight pode validar a identidade declarada da branch, mas não substitui consulta futura do banco, conexão segura ou teste de aplicação executada.

**Operação seguinte, ainda não executada:** ligar compute *somente nessa branch descartável*, verificar alvo/role/DB, gerar e inspecionar o SQL exato do esquema, aplicar ensaio não destrutivo à branch e recolher prova de testes A/B, sem configurar Vercel nem tocar produção. Exige autorização específica para aplicar o esquema.

## Laboratório completo de esquema — evidência adicional (21/11/2026)

**Branch extra exclusiva de QA, distinta da staging default:** `api-v1-pr629-full-schema-lab-20261121` (Neon `br-snowy-band-bcb0auy6`) clonada da branch de ensaio histórico `pr00-a2c3-ddl-rehearsal-20261117` (`br-rough-bread-bc1ulrnc`), no projeto isolado `holy-fog-36254823`.
- PostgreSQL validou antes da execução: base de **92 tabelas**, `tenants=0`, `leads=0`, `users=0`, 0 tabelas da API e extensão `vector` presente.
- Recuperado artefato `pr01-disposable-migration-rehearsal-evidence` do CI da PR01 (run `44913393211`), HEAD `0491f415...`; conferido SHA256 do `additive.sql` (`4cb34ee60e93cb81f45ee9c13da67bb598589a66f0063c49629552a95bf2c369`), SQL com **10 CREATE TABLE**, 20 índices adicionais e 10 FKs `ON DELETE RESTRICT`, sem `DROP/TRUNCATE/DELETE` DML.
- **Atenção à fidelidade:** o laboratório recebeu **40 comandos DDL reconstruídos/transcritos a partir do artefato**, em uma transação pelo conector Neon, não uma execução byte-a-byte do arquivo do CI. O inventário do PostgreSQL foi conferido e corresponde em quantidade e nomes de 10 novas tabelas, 20 índices adicionais + 10 PK e 10 FKs `RESTRICT`; a equivalência completa do SQL deve ser verificada antes do aceite final de migração.
- Após o commit SQL: **102 tabelas públicas; 10 FKs da API, todas `RESTRICT` e 0 `CASCADE`**; as tabelas de empresas, usuários, leads, integrações e credenciais continuam vazias.
- Compute QA limitado a **0,25 CU**, suspensão configurada para **300 segundos**. Nenhum deploy Vercel, nenhuma chave M2M real, nenhum SQL em produção ou na branch staging default. A outra branch vazia `br-nameless-art-bc6k4c5g` permanece com sua finalidade de isolamento separada.
- **Ainda não é homologação ponta a ponta:** faltam runtime PR02 na Vercel staging, ligação segura à branch QA com varíaveis isoladas, regressão A/B end-to-end, egress, política de retenção, backup/restore de schema atual e autorização de release. O snapshot formal mantém `decision: NO_GO`.

**Próxima execução:** revisar a equivalência do DDL do artefato, garantir roteamento estritamente staging, e executar validações sintéticas de leitura/escopos. Não elevar flags de liberação pelo sucesso desse ensaio.


## Ensaio de recuperação e plano operacional de rollback — 22/11/2026

### Evidências de recuperação isolada — TESTE DE CLONAGEM (não PITR)
- Origem: projeto Neon de **staging isolado** `holy-fog-36254823`, branch `br-snowy-band-bcb0auy6` (`api-v1-pr629-full-schema-lab-20261121`). O banco de origem tem exclusivamente fixtures de QA: 2 tenants, 3 leads, 3 credenciais revogadas e 0 integrações ativas.
- Derivação criada **sem compute por padrão**: `api-v1-pr629-recovery-check-20261122`, id `br-curly-smoke-bck076qv`, parent `br-snowy-band-bcb0auy6`. Compute de leitura/validação independente `ep-round-paper-bclr72y6` limitado a 0,25 CU com suspensão automática em 300 s.
- Consultas PostgreSQL executadas independentemente sobre origem e clone. Ambas retornaram **102 tabelas públicas, 30 índices da API (incluindo PK), 10 FKs da API**, 10 `RESTRICT`, 0 `CASCADE`, 2 tenants, 3 leads, 3 credenciais revogadas, 0 não revogadas, 0 integrações ativas, 10 registros de quota. A comparação dos contadores foi idêntica.
- Evidência: cópia consistente por **branch clone** do mesmo projeto, com leitura independente. **Não** é uma operação de `restore_snapshot`, nem demonstra restauração de incidente, tempo real de recuperação (RTO), perda máxima (RPO), integridade byte a byte de todas as linhas ou recuperação do Neon de produção. `create_snapshot` da branch QA não-root foi recusado pelo provedor; não alterar default/prod para contornar.
- Permanecem pendentes: drill **PITR/backup** independente e verificações de integridade e temporização acordadas, incluindo eventual reconexão Vercel ao ramo restaurado, antes de autorizar publicação.

### Isolamento de saída / egress
- Inspeção estática do commit `6ee6a1349d6ac05b9165b60d430c7e11c4cf5dfd` contemplou as **8 rotas `app/api/v1/**/route.ts`** e os módulos de leituras M2M de `lib/api-v1` vinculados. Não foi localizado uso direto de `fetch(`, Axios ou URL HTTP de serviço externo nas rotas/leitores consultados. A palavra `webhook` em capacidades/escopos é descritiva, não uma chamada observada.
- Os endpoints testados eram GET com escopo do tenant e foram exercitados com leads sintéticos. **Inspeção de código não demonstra egress de todo o aplicativo**, de integrações indiretas, jobs/crons, SDKs, outros endpoints ou infraestrutura compartilhada. Não alterar nem desabilitar Meta/Google/Ads/Pixel de produção para testar.
- Critério futuro de aceite: inventário runtime de todos os destinos externos e jobs habilitados no deployment, garantia de isolamento por ambiente, monitoramento DNS/HTTP/egress durante operação sintética e ausência de env/credenciais produtivas no ambiente de QA. Até lá: `staging_outbound_egress = NOT_ATTESTED`.

### Plano de rollback operacional — documentado, **não aprovado para produção**
1. **Congelar ativação:** manter `FLIPFORM_API_V1_ENABLED=false` no projeto e ambiente afetados; bloquear emissão de novas chaves e revogar quaisquer credenciais de integração ativas afetadas se houver incidente. Não remover registros de auditoria.
2. **Se apenas preview:** voltar a variável **específica da branch** para `false` e fazer novo build do mesmo commit para uma implantação OFF. Referência QA comprovada: `dpl_99XS55EfneZMzKjBRyEm19Byde53`, estado READY; GET `/api/v1/forms` e `/api/v1/leads` retornaram 404 `api_unavailable`. A alteração de env **não é retroativa** para deployments imutáveis já criados; estes só ficam inertes para acesso autenticado após revogação de chaves.
3. **Se produção no futuro:** manter feature flag OFF e revogar chaves primeiro; utilizar somente deployment produtivo anterior, **identificado e aprovado no momento do incidente**, com teste de compatibilidade do schema aditivo. Não executar rollback Vercel sem autorização, nem restaurar dump/banco sobre produção automaticamente.
4. **Banco:** as 10 tabelas API usam FKs `RESTRICT` e migração aditiva; não usar `DROP TABLE`/reverter estrutura em rollback rápido. Manter dados e evidências, corrigir adiante mediante migração revisada. Restauração PITR, swap de branch, mudança de URL de banco ou migração em Neon de produção exigem protocolo separado.
5. **Pós-contenção:** conferir respostas 404 com flag OFF, chaves revogadas, erros e logs sem segredo, integridade das tabelas/tenants, indicadores de exfiltração, monitorar estabilidade e criar registro de aprovação/retroanálise.
6. **Gates não liberados:** faltam retenção/LGPD/legal hold, aceitação de PITR/RPO/RTO, egress real e aprovação de deploy/rollback por responsável. `NO_GO` permanece explícito. Quatro workflows de manutenção continuam Disabled.

Este documento descreve um procedimento de contingência e evidência técnica de staging; não altera a matriz de aprovação nem é autorização de produção.
