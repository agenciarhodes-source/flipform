# PR01 — Gate de prontidão para homologação isolada (20/11/2026)

**Estado:** DRAFT / NO-GO. Este documento **não** aprova política LGPD, staging, migration, merge, deploy, produção ou ativação da API.

## Evidência efetivamente observada em modo de leitura

- GitHub PR #627, HEAD anterior a esta etapa: a6471d190385. CI, Smoke, Playwright, Semgrep, Gitleaks, SQL offline e ensaio PostgreSQL descartável aprovados; PR ainda Draft e não mesclado.
- Vercel possui **dois projetos distintos**, `flipform` (produção) e `flipform-staging`. Os deployments consultados da branch `feature/pr01-global-api-foundation` foram **zero em ambos**, e `vercel.json` ainda bloqueia o Preview automático da branch.
- A branch distinta do PR00 #626 possui um Preview **READY** no projeto `flipform-staging` (commit 678d3c9). READY comprova o build/publicação daquele Preview, **não** a autenticação de seu endpoint de identidade, banco/role efetivos do runtime ou controle total das saídas externas.
- O projeto `flipform-staging` apresenta variáveis de conexão com valores sensíveis; a consulta apenas identificou **nomes e escopos** (DATABASE_URL e DIRECT_URL, em Preview e Production). **Nenhum valor de conexão foi recuperado** para esta análise. Não assumir que a conta de produção está isolada apenas por ter outro projeto.

## Resultado da presente etapa

Foi acrescentado o manifesto `docs/security/pr01-staging-release-gates-DRAFT.json` e o script `scripts/pr01_staging_no_go_gate.py` ao mesmo PR. Um check verde comprova **somente que os campos de autorização continuam bloqueados**, além da configuração que desabilita Preview automático, e não que a API esteja liberada. Testes negativos recusam aprovações manuais no JSON sem alterar e revisar o próprio controle.

O ensaio de migração local acrescenta o relatório `staging-no-go-report.json` ao artefato **descartável** do GitHub Actions. O script lê apenas arquivos locais versionados; não consulta Neon, GitHub, Vercel, secrets, clientes nem conectores.

## Sequência para destravar — autorizações separadas

1. **Política de dados:** responsável jurídico/privacidade definir base legal/finalidade, retenção por categoria, critérios de minimização/eliminação, tratamento de pedidos dos titulares e legal hold. As 10 FKs RESTRICT continuam PENDING; sem autorização de exclusão definitiva.
2. **PR00 staging:** comprovar a identidade do banco **em runtime** com a operação controlada do PR #626 e obter evidência de segregação de egress, jobs, cron, webhooks, env vars e integrações. Não transportar o middleware temporário de lockdown do PR #626 para main.
3. **Plano de homologação:** aprovar, em separado, snapshot/backup, restauração testada, papel e alvo do banco, lock e rollback/forward-fix; somente então considerar migration **exclusiva de staging**, sob nova autorização específica.
4. **Ensaios A/B:** com tenants e segredos sintéticos criados no banco de staging **efetivamente isolado**, testar isolamento entre empresas, revogação e rotação, quotas concorrentes, suspensão, auditoria, regressão de acesso e inexistência de chamadas externas.
5. **Decisão de release:** revisão de branch/ruleset, status de PR00 #623–#626, diffs, CI, políticas e plano de recuperação. Mesmo com tudo verde, exigir autorização nova para merge e outra para Neon/produção e ativação de flags; não unificar decisões.

## Riscos que o check NÃO resolve

- Vínculo das credenciais do Preview ao projeto/branch Neon corretos; nenhum acesso de banco de staging foi realizado.
- Garantia de que serviços externos não serão acionados por cron, webhooks, atividades de build ou outras rotas caso se publique a branch PR01; falta hard lockdown equivalente ao Preview de diagnóstico do #626.
- Períodos legais de retenção, anonimização e expurgo de dados; decisões não podem ser inferidas dos tempos técnicos de nonce/quota.
- Recovery de dados já existentes: o ensaio 102→92 elimina apenas dez tabelas **vazias em um banco descartável**. Não é rollback seguro da produção.

**NO-GO confirmado nesta etapa: nenhum deployment, chave real, migration ou mudança de flag foi realizado.**
