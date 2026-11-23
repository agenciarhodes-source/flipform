# PR629 — verificação real do destino do banco no runtime (23/11/2026)

**Status: IMPLEMENTADO NO CÓDIGO, MAS DESATIVADO E NÃO EXECUTADO NO RUNTIME.** Isto não autoriza deploy, exclusão de branch, migração, merge nem ativação da API. Produção permanece NO_GO. Os testes A/B já aprovados não precisam ser repetidos.

## Finalidade / descoberta

O conector Vercel confirma existência de DATABASE_URL / DIRECT_URL no preview PR629, mas retorna **nenhum valor descriptografado** até ao consultar por ID. A ausência de valor é limitação de acesso; NÃO demonstra variável vazia nem destino correto. O projeto staging também recebe deployments de outras branches. O último deployment verificado do PR629 estava READY e respondeu 404 api_unavailable nos endpoints /api/v1/forms e /api/v1/leads, porém seu SHA e0ab8a45... era anterior ao HEAD do PR.

Não é seguro excluir a branch antiga Neon `br-lively-rice-bc6gygy6` com base apenas em metadados do Vercel. Tampouco executar PITR diretamente em branch criada por snapshot restore: o Neon documenta que este tipo de origem não suporta Instant Restore/PITR.

## Implementação limitada

- `lib/qa/pr629-db-target-attestation.ts`: valida ambas as URLs sem ecoá-las; destino aprovado é **somente** o endpoint `ep-round-cake-bct4seb5.c-16.us-east-1.aws.neon.tech` e seu pooler, banco `flipform_staging`, branch de laboratório `br-snowy-band-bcb0auy6`, projeto Neon isolado `holy-fog-36254823`. DIRECT_URL deve usar o host não-pooler. A verificação não expõe credentials, usernames, URLs ou hosts em HTTP.
- `app/api/pr629-qa/db-target/route.ts`: rota GET inativa por padrão. Exige VERCEL_ENV=preview, VERCEL_GIT_COMMIT_REF exatamente security/api-v1-homologation-20261121, PR629_DB_ATTESTATION_ENABLED=true e PR629_DB_ATTESTATION_EXPIRES_AT válido por no máximo 30 minutos, PR629_BLOCK_EXTERNAL_EGRESS=true, FLIPFORM_API_V1_ENABLED=false, EMAIL_PROVIDER=none e MAINTENANCE_GATE=disabled. Exige também token Bearer específico de pelo menos 32 caracteres com comparação em tempo constante. **Apenas após os testes de configuração e autorização** faz `SELECT current_database()::text`, sem consultar tabelas de negócios ou PII. Responde apenas códigos genéricos e `attested` booleano, com no-store.
- Proteção de CI: `tests/pr629-db-target-attestation.test.ts`, `tests/test_pr629_db_target_attestation_static.py` e job offline da workflow PR629. Testes usam credenciais sintéticas, sem DNS/conexões e sem exposição de secrets.

### Para executar depois — precisa de autorização explícita e deploy de preview isolado

1. Fixar o commit exato do PR629 aprovado para preview. Confirmar que Vercel `flipform-staging` é um projeto distinto de `flipform` produtivo. Atualmente `vercel.json` desabilita deployments automáticos de security/api-v1-homologation-20261121. **Não alterar esse bloqueio automaticamente.**
2. Definir no Vercel somente para o **preview dessa branch**, jamais production: `PR629_DB_ATTESTATION_ENABLED=true e PR629_DB_ATTESTATION_EXPIRES_AT válido por no máximo 30 minutos` e `PR629_DB_ATTESTATION_TOKEN=<token temporário aleatório >= 32 caracteres> e PR629_DB_ATTESTATION_EXPIRES_AT=<horário UTC até 30 minutos à frente>`. Não inserir token no GitHub nem em logs. Preservar flags API OFF, egress ON, email none, maintenance disabled.
3. Validar com o operador, sem divulgar URLs, se as variáveis branch-scoped DATABASE_URL e DIRECT_URL realmente apontam ao host Neon QA aprovado. Se for necessário mudá-las, exige decisão separada; jamais copiar connection string de produção.
4. Autorizar um **deploy de preview controlado** do commit específico (não produção), confirmar Git SHA do deployment e proteção de acesso. Fazer requisição autenticada somente ao endpoint GET /api/pr629-qa/db-target, sem salvar token nos logs. **Resultado PASS = status HTTP 200, attested=true**, após a consulta real. HTTP 404, 409 ou 503 são NO_GO; não repetir com credenciais produtivas.
5. Revalidar GET /api/v1/forms e /api/v1/leads retornando 404 api_unavailable. Remover/desativar flags e token de diagnóstico após a verificação, reimplantar se necessário para que o deployment ativo não conserve configuração de diagnóstico; guardar SHA, timestamp, decisão e screenshot/redação sem secrets no PR.
6. O sucesso confirma a identidade do banco do **deployment consultado**, não a do deploy produtivo, nem ausência total de egress, nem validação de PITR, e não resolve retenção LGPD.

## PITR: rota de ensaio correta

O Neon só suporta Instant Restore/PITR de raiz nativa elegível, não a partir de branch formada por snapshot restore; criar outra raiz por restore_snapshot não valida PITR. O projeto QA existente tem o limite de cinco branches-raiz. Não apagar o baseline antigo para contornar artificialmente o limite. Planejar projeto Neon isolado novo com raiz nativa **após verificar cobrança e autorização de criação**, executar alteração/restore de dados exclusivamente sintéticos, medir perda RPO e tempo RTO e comprovar reconexão. O ensaio de snapshot de esquema API 102 tabelas já está preservado e não será repetido.

## Limites de aceitação

Ainda pendentes: prova de saída externa em runtime, PITR timestamp/LSN em raiz nativa, RPO/RTO, revisão LGPD de dez categorias (bases legais, períodos, legal hold, pedidos de exclusão), rollback produtivo e autorização de merges/rollout. Continuar `NO_GO`. Workflows de manutenção Disabled não devem ser habilitados por este pacote.
