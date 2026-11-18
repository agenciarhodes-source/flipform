# Pollo OS — PR 00 / A2-B — Evidências de recuperação e critérios de aceite

**Data:** 18/11/2026. **Status:** evidência parcial; gate G8/A2 Recovery **PENDENTE**.  
**PR vinculado:** #623 (Draft, sem merge). **Plano Mestre:** v6.1.  
**Natureza:** auditoria de metadados, schema e comparação agregada de fixture. Sem SQL de escrita, DDL/DML, snapshot novo, restore, deploy, merge ou acesso ao banco de produção.

## 1. Ambientes explicitamente separados

| Finalidade | Projeto Neon | Branch | Banco |
|---|---|---|---|
| Produção, **somente metadados de backup** | `leadflow-crm` (`royal-truth-23388416`) | `production` (`br-round-morning-apjwfg61`, protegida) | `neondb` |
| Laboratórios sintéticos | `flipform-staging-isolated` (`holy-fog-36254823`) | branches A2-B descritas abaixo | `flipform_staging` |

**Não copiar/restaurar dados reais da produção no laboratório.** A existência de snapshots no projeto produtivo não prova a validação funcional de recuperação dele.

## 2. Histórico confirmado por Neon e auditoria A2-B

- Snapshot `snap-aged-morning-bcubwian`, nome `pr00-a2b-empty-staging-baseline-20261117`, criado em 17/11/2026 04:54:19Z no staging.
- Branch `pr00-a2b-snapshot-restore-20261117` (`br-lively-rice-bc6gygy6`): `restore_status=restored`, `restored_from=snap-aged-morning-bcubwian`, criada 17/11/2026 04:54:25Z. A enumeração atual mostrou **zero tabelas de usuário**, coerente com o baseline vazio. Isto é evidência de recuperação de baseline, **não** recuperação de sistema completo.
- Branch `pr00-a2b-recovery-fixtures` (`br-wandering-lake-bcoahknm`): tabela `public.pr00_a2b_restore_probe` com colunas `probe_id`, `marker`, `created_at`; 1 registro.
- Branch filha `pr00-a2b-fixture-recovery-copy` (`br-bold-surf-bcsplt75`): tabela com mesmo schema, 1 registro; fingerprint agregado da concatenação ordenada de `probe_id:marker` **idêntico** ao original (`c5b504e563b42631e54739d4d42d3db2`). Nenhum dado bruto retornado.
- Registro histórico da execução A2-B na conversa do projeto identifica a prova como um registro fictício; PR #621 documenta separadamente 14 fixtures sintéticas de dois tenants em laboratório A2-C.4. **O esquema e o hash não comprovam, por si só, a proveniência fictícia do registro A2-B**. Confirmar essa origem documentalmente antes de formalizar aceite.

### O que a evidência cobre

1. Neon registra restauração de um snapshot do baseline vazio em nova branch.
2. Tabela mínima de prova sobrevive em branch de cópia isolada com checksum de conteúdo idêntico.
3. Não houve interação com projeto Neon produtivo nesses testes de leitura.

### O que **não** cobre

- Restore funcional de schema completo do FlipForm (tenants, pipelines, forms, leads, assinaturas, histórico, webhooks, migrations, auth).
- Backup criptografado externo, exercício de indisponibilidade regional, failover ou retenção garantida.
- Teste de integridade detalhada de 14 fixtures nesta etapa; evidências A2-C.4 são históricas e independentes.
- Prova de origem sintética por trilha auditável no laboratório A2-B; RPO ou RTO medidos; operação de restauração da produção.

## 3. Produção: proteção existente versus eficácia comprovada

Metadados obtidos no Neon de produção:
- Branch `production` é protegida.
- Janela de point-in-time recovery (PITR): 7 dias.
- Snapshots automáticos diários 06:00 UTC, política de retenção de 30 dias.
- 24 snapshots listados em 18/11/2026, incluindo manuais.

**Não confundir janela PITR ou cadência de snapshot com RPO medido.** Backups disponíveis não demonstram restore completo, tempo de indisponibilidade ou quanta perda ocorreu em uma falha real.

## 4. RPO e RTO — resultados honestos

| Indicador | Objetivo de aceite | Evidência atual |
|---|---|---|
| RPO — máxima perda admissível | Definir com responsável de negócio e validar pelo ensaio | **Não definido/não medido** |
| RTO — recuperação do serviço | Definir com operação, medir até validação de serviço funcional | **Não definido/não medido** |
| Restauração do banco de teste | Criar/restaurar snapshot em **recurso descartável** e confirmar schema, checksums e tempos | **Parcial**: baseline vazio restaurado; fixture copiada |
| Integridade pós-restore | Smoke com fake tenant A/B e asserts de isolamento | **Não comprovada nesta etapa** |
| Plano de rollback | Evidência de checkpoint/snapshot, comando, responsáveis e teste sintético | **Pendente** |

**Metodologia proposta para eventual ensaio autorizado:** usar projeto/branch de teste isolado e dataset **exclusivamente sintético**; fixar carimbo `t_backup`, `t_failure`, `t_restore_start`, `t_ready`, `t_smoke_pass`; avaliar RPO a partir dos dados recuperados versus último ponto de escrita conhecido e RTO pela restauração até smoke funcional aprovado. Não usar cronologia de criação de branch como substituto de medição.

## 5. PR #623 / GitHub Environment — checkpoint administrativo

**Comprovado por capturas do responsável (UI GitHub):**
- Environment `production-maintenance` criado com branch de deployment permitida `main`, 0 tags.
- Variáveis configuradas: `MAINTENANCE_DB_HOST`, `MAINTENANCE_DIRECT_HOST` (hosts diretos Neon coincidentes), `MAINTENANCE_DB_NAME=neondb`, `MAINTENANCE_DB_USER=neondb_owner`, `MAINTENANCE_GATE=disabled`.
- Nenhum secret exclusivo de manutenção cadastrado no Environment nas capturas.
- Quatro workflows `Repair ... Schema` marcados **Disabled** na UI GitHub.
- No GitHub privado, aprovação obrigatória por reviewer no Environment **não foi visualizada**; não declarar governança de dupla aprovação implantada.

**Conclusão:** o ambiente existe, porém a segurança efetiva de reparos permanece bloqueada. O `MAINTENANCE_GATE` ainda **não protege os workflows legados que estão na `main`**, pois os guards estão em PR #623 Draft; os workflows legados foram desativados manualmente. NÃO reativar, não cadastrar/usar credenciais de owner e não habilitar gate.

## 6. Critérios de liberação pendentes

- [ ] Atestar documentalmente que as fixtures A2-B são fictícias e que não vieram de produção.
- [ ] Revisar escopo de permissões e avaliar alternativa à role `neondb_owner` para manutenção DDL; nenhuma role nova foi criada.
- [ ] Homologar aprovação humana independente ou política alternativa formal, **sem afirmar equivalência a environment required reviewers**.
- [ ] Preparar procedimento de retorno e checkpoint válido antes de cada reparo.
- [ ] Executar ensaio futuro **somente sintético e isolado**, com autorização delimitada, e registrar RPO/RTO.
- [ ] Confirmar que secrets `PR00_MAINTENANCE_DATABASE_URL` e `PR00_MAINTENANCE_DIRECT_URL` foram criados **somente no Environment**, sem expor valores; atualmente pendentes.
- [ ] Revisar scripts de reparação e SQL caso a caso antes de permitir execução; nunca rodá-los como teste de setup.
- [ ] Revisar PR #623 e todos os gates PR00 com aprovação expressa antes de qualquer merge.

**Conclusão formal:** A2-B demonstra restauração do baseline e cópia íntegra da fixture mínima; G8 não está integralmente homologado. O PR #623 continua Draft, `MAINTENANCE_GATE=disabled`, workflows reparadores desativados, PR 01 continua sem implementação.
