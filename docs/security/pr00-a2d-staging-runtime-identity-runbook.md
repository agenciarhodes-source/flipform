# PR 00 A2-D — prova sanitizada de identidade do banco no runtime de staging

**Data:** 18/11/2026  
**Status:** DRAFT / candidato técnico. **Não fazer merge/deploy por efeito deste documento.**
**Projeto Vercel de destino futuro:** somente `flipform-staging` (id `prj_UOvo8lKGiIvp7IuBS4vtL9CnSZIu`).
**Neon de staging:** projeto separado `flipform-staging-isolated`, branch `staging`, host direto `ep-morning-heart-bcj72cwl.c-16.us-east-1.aws.neon.tech`, banco `flipform_staging`, role `flipform_staging_owner`.

## Escopo implementado no Draft

- Um endpoint desativado por padrão: `GET /api/internal/pr00/staging-identity`.
- Ativação somente se todas as condições forem verdadeiras: `PR00_STAGING_ATTESTATION_ENABLED=true`, `VERCEL_PROJECT_ID` igual ao projeto staging, `VERCEL_ENV=production` **dentro deste projeto staging**, `NODE_ENV=production`, token próprio forte presente, `DATABASE_URL` e `DIRECT_URL` apontando exatamente ao host, banco e usuário de staging com TLS explícito e senha.
- Token obrigatório via header `x-pr00-staging-attestation-token` (não em URL). Comparação constante em tempo para tokens do mesmo tamanho. Responde 404 genérico se desativado, fora de escopo ou sem autenticação.
- Quando habilitado e autenticado, executa **somente** `SELECT current_database() AS database_name, current_user AS role_name`. Não consulta tabelas, não faz migrations, não lê registros de usuário, não chama serviços externos e não retorna host, senha, URL, stack trace ou nomes da role/database.
- Retorno `200 {"ok":true,"code":"staging_database_confirmed"}` somente com conexão aprovada e identidade confirmada. Se falhar a query ou divergir, retorna `503` genérico. Não loga exception do driver.
- Testes offline de bloqueios: projeto Vercel errado, target Preview, flag ausente, token inadequado, host de produção, nome de banco/role errado, ausência de TLS e URL inválida.
- Desabilitação de Preview Vercel no branch desta PR, como primeiro commit.

## Ativação futura (ainda NÃO autorizada)

1. Revisar CI, diff, endpoint/guards, ausência de side-effects e as regras do projeto staging. **Não** alterar o projeto `flipform` de produção.
2. Certificar a identidade dos secrets do staging por procedimento independente de comparação sanitizada com Neon; o código compara a URL configurada ao host known-good, mas isso **não substitui a revisão administrativa da origem das credenciais**.
3. No Vercel do **projeto staging apenas**, adicionar variável `PR00_STAGING_ATTESTATION_ENABLED=true` e secret **novo e de alta entropia** `PR00_STAGING_ATTESTATION_TOKEN` (>= 32 bytes), escopados **somente à target Production do projeto staging**. Não copiar JWT, CRON_SECRET ou credencial produtiva. Não colocar segredo em GitHub, arquivos, chat, command line compartilhada ou logs.
4. Fazer deploy do código **exclusivamente nesse projeto staging**, após autorização específica e **prova separada de bloqueio das integrações externas**. **Apenas** fazer merge do PR em main teria efeito nos outros projetos: merge não está autorizado neste momento. Usar plano de deploy segregado sem habilitar Preview do projeto produtivo.
5. Executar **uma** requisição privada com token enviado somente em header, sem publicar resposta com credencial; registrar apenas `ok`, `code`, status, hash do commit e ID do deployment.
6. Ao terminar, remover/desativar a flag e token no staging, e redeploy se necessário para revogar sua exposição.
7. As quatro workflows de reparação do GitHub devem permanecer `Disabled` e `MAINTENANCE_GATE=disabled` até homologação independente do PR #623 e nova autorização; **não reativar** nesta etapa.

## Limitações e aceite

- A URL allowlisted mapeia para um endpoint Neon de staging conhecido pelos metadados do provedor; a consulta ao banco confirma somente `current_database()` e `current_user`, **não lê uma função nativa de project/branch IDs Neon**, portanto não é prova criptográfica da identidade do projeto.
- O teste não comprova que outras rotas da aplicação não enviam eventos externos, nem que o ambiente inteiro tem schema/bootstrap correto; é apenas o gate de identidade runtime.
- O Neon de staging tem pooler desabilitado nesta data; se o pooling for ativado no futuro, a validação deverá ser revisada antes de mudar a URL.
- Sem token/flag o endpoint não consulta o banco e retorna 404. No projeto Vercel produtivo `flipform`, mesmo que alguém habilite a flag acidentalmente, a diferença de `VERCEL_PROJECT_ID` impede o acesso.
- **Gate de conclusão:** CI/Playwright e auditoria do código aprovados, ambiente staging isolado, teste controlado real do endpoint apenas após autorização, e integração externa bloqueada. Até então A2-D está **parcial**.

**Sem merge, alterações em produção, banco real, dados de clientes, Ads/Pixel, WhatsApp, Stripe, migração ou execuções administrativas.**
