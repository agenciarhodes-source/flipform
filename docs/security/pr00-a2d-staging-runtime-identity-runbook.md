# PR 00 A2-D — prova sanitizada de identidade do banco no runtime de staging

**Data:** 18/11/2026  
**Status:** DRAFT / candidato técnico. **Não fazer merge/deploy por efeito deste documento.**
**Projeto Vercel de destino futuro:** somente `flipform-staging` (id `prj_UOvo8lKGiIvp7IuBS4vtL9CnSZIu`).
**Neon de staging:** projeto separado `flipform-staging-isolated`, branch `staging`, host direto `ep-morning-heart-bcj72cwl.c-16.us-east-1.aws.neon.tech`, banco `flipform_staging`, role `flipform_staging_owner`.

## Escopo implementado no Draft

- Um endpoint desativado por padrão: `GET /api/internal/pr00/staging-identity`.
- Ativação somente se todas as condições forem verdadeiras: `PR00_STAGING_ATTESTATION_ENABLED=true`, `VERCEL_PROJECT_ID` igual ao projeto staging, `VERCEL_ENV=preview`, `VERCEL_GIT_COMMIT_REF=security/pr00-a2d-staging-db-attestation-20261118`, `NODE_ENV=production`, token próprio forte presente, `DATABASE_URL` e `DIRECT_URL` apontando exatamente ao host, banco e usuário de staging com TLS explícito e senha.
- Token obrigatório via header `x-pr00-staging-attestation-token` (não em URL). Comparação constante em tempo para tokens do mesmo tamanho. Responde 404 genérico se desativado, fora de escopo ou sem autenticação.
- Quando habilitado e autenticado, executa **somente** `SELECT current_database() AS database_name, current_user AS role_name`. Não consulta tabelas, não faz migrations, não lê registros de usuário, não chama serviços externos e não retorna host, senha, URL, stack trace ou nomes da role/database.
- Retorno `200 {"ok":true,"code":"staging_database_confirmed"}` somente com conexão aprovada e identidade confirmada. Se falhar a query ou divergir, retorna `503` genérico. Não loga exception do driver.
- Testes offline de bloqueios: projeto Vercel errado, target Production, branch incorreta, flag ausente, token inadequado, host de produção, nome de banco/role errado, ausência de TLS e URL inválida.
- O Preview automático do GitHub ficou desabilitado desde o primeiro commit desta branch. A publicação futura será manual e **somente no projeto staging, target Preview**, sem alterar os aliases de produção do próprio staging.
- Middleware desta PR bloqueia toda requisição no Preview exceto **GET** da rota de diagnóstico. Esse bloqueio é específico do código desta branch e **não deve ser mesclado à `main`**.
- O script `scripts/pr00-staging-build-attest.ts` foi incluído no `npm run build` somente nesta PR: nos builds Vercel ele exige exatamente o projeto/branch/host/banco/usuário de staging e executa uma única consulta `SELECT current_database(), current_user`. Em CI/local não acessa banco Neon. Se a identidade divergir, **o deployment falha antes da publicação**.

## Salvaguarda adicional de expiração (20/11/2026 — antes do teste autorizado)

- O endpoint exige também `PR00_STAGING_ATTESTATION_EXPIRES_AT`, uma data ISO UTC completa (com milissegundos e `Z`), posterior ao relógio do servidor e no máximo 45 minutos adiante.
- Essa checagem é realizada **a cada requisição**, pois um Preview Vercel já publicado conserva as variáveis originais mesmo quando elas são modificadas no painel. Sem a data, com data expirada ou distante demais, a resposta é 404.
- Para o teste pontual autorizado, as três variáveis temporárias são **somente Preview e somente na branch exata PR00 A2-D**. Após o teste, atualizar a flag para `false`, invalidar o token e colocar a data no passado; adicionalmente revogar qualquer share link. A cópia antiga do Preview perde a validade automaticamente na data, independentemente de redeploy.
- Não interpretar essa camada como autorização de deploy genérico, merge, migração, CRM, credenciais produtivas ou transferência de dados.

## Reforço de lockdown de rotas (20/11/2026)

- A branch PR00 A2-D agora bloqueia **todas** as rotas em contexto Vercel, mesmo com `VERCEL_ENV` ausente ou configuração parcial. Somente o GET exato da rota de identidade é encaminhado quando `VERCEL_ENV=preview` e `VERCEL_PROJECT_ID` corresponde ao projeto staging. O endpoint ainda aplica seus próprios controles de expiração, token, branch e banco.
- O bloqueio aplica-se apenas às requisições HTTP que passam pelo middleware, não a egress de build, tarefas agendadas ou código executado fora do ciclo HTTP. Esses riscos permanecem pendentes.
- `tests/pr00-staging-route-lockdown.test.ts` verifica negação de CRM, integrações, webhooks e APIs, métodos não GET, URLs semelhantes e contextos Vercel parciais; o CI executa esse teste offline junto aos testes de identidade.
- **Esse middleware é temporário, específico da branch de diagnóstico e não pode ser incorporado à main.** A mudança não reativa o Preview automático, não solicita deploy, nem certifica runtime.

## PR00 A2-E — preflight contra integrações externas no Preview (20/11/2026)

- As rotas já existentes incluem cron de cobranças, anexos e conversões do Google; jobs internos e webhooks Meta, WhatsApp, Stripe e ZapSign. Existência da rota **não** significa execução agendada. A ausência de entradas `crons` no `vercel.json` da branch é evidência limitada ao agendamento pelo deploy desta branch.
- O helper `lib/security/pr00-staging-integration-preflight.ts` recusa configuração de agendamentos cron, redeploy automático da branch de diagnóstico e presença de nomes de variáveis de credenciais de provedores externos ou jobs no ambiente do build. Executa no build **apenas da branch PR00**, antes da consulta read-only ao Neon. Falha de verificação interrompe o build com resultados booleanos, sem expor nomes/valores de secrets.
- Os testes `tests/pr00-staging-integration-preflight.test.ts` exercitam os bloqueios offline no CI. O inventário read-only da Vercel encontrou zero connections de conectores e zero registros de webhooks da própria Vercel para o projeto. Isso **não** demonstra inexistência de configurações externas nos provedores nem de processos fora do runtime do Preview.
- **Limitação decisiva:** validação de configuração e bloqueio HTTP não são firewall de saída; código SSR, inicialização, build e qualquer execução fora do middleware podem fazer conexões externas sem credencial. Não declarar `staging_egress_isolation_attested` como true no PR01 com base só nesses checks. Para GO final de egress, exigir controle de rede verificável ou revisão independente específica das chamadas outbound e dos gatilhos automáticos, com evidência sanitizada.
- A mudança não configura, agenda ou executa qualquer job, não altera produção, nem autoriza ativação do PR01.

## PR00 A2-F — startup de telemetria em Preview de diagnóstico (20/11/2026)

- Em `instrumentation.ts`, a inicialização de `sentry.server.config` e `sentry.edge.config` ocorre durante o boot do runtime e configura um SDK de telemetria. A presença ou ausência de DSN não é prova de isolamento.
- Na branch PR00 A2-D exclusivamente, o helper `lib/security/pr00-staging-instrumentation-policy.ts` avalia Vercel env/projeto e branch antes de importar os módulos de Sentry. Preview correto retorna cedo e não importa Sentry; projeto/target/branch divergente ou parcial lança erro genérico **antes de importar**. No Edge, a ausência de git ref é tolerada somente no projeto/target exatos, já que o endpoint individual continua validando a branch. Local/CI sem marcadores Vercel mantém comportamento anterior.
- Testes negativos offline cobrem ambientes inválidos e garantem que o runtime não carregue Sentry nesses casos. Isso complementa o lockdown HTTP, mas **não equivale a firewall de rede** nem comprova bloqueio de cron, transportes HTTP alternativos, conexões nativas ou egress em build.
- O preflight do build também nega variáveis de telemetria (Sentry/OTEL/OTLP/PostHog/Datadog/Axiom/Logtail). Assim, um DSN adicionado por engano é barrado antes da consulta ao Neon. O controle trata nomes de variáveis; não inspeciona valores de credenciais.
- Nenhum projeto de produção, DSN, token, cron, API externa ou PR01 foi ativado por esta mudança. **Nunca incorporar o instrumentation temporário em main.**

## Ativação futura (ainda NÃO autorizada)

1. Revisar CI, diff, endpoint/guards, ausência de side-effects e as regras do projeto staging. **Não** alterar o projeto `flipform` de produção.
2. Certificar a identidade dos secrets do staging por procedimento independente de comparação sanitizada com Neon; o código compara a URL configurada ao host known-good, mas isso **não substitui a revisão administrativa da origem das credenciais**.
3. No Vercel do **projeto staging apenas**, adicionar variável `PR00_STAGING_ATTESTATION_ENABLED=true` e secret **novo e de alta entropia** `PR00_STAGING_ATTESTATION_TOKEN` (>= 32 bytes), escopados **somente à target Preview do projeto staging**. Não copiar JWT, CRON_SECRET ou credencial produtiva. Não colocar segredo em GitHub, arquivos, chat, command line compartilhada ou logs.
4. Fazer deploy manual do commit exato **exclusivamente como Preview no projeto `flipform-staging`**, após confirmar que os bloqueios de todas as outras rotas entram antes de integrações e que o build de identidade está ativo. **Apenas** fazer merge do PR em main teria efeito nos outros projetos: merge não está autorizado neste momento. Usar plano de deploy segregado sem habilitar Preview do projeto produtivo.
5. Executar **uma** requisição privada com token enviado somente em header, sem publicar resposta com credencial; registrar apenas `ok`, `code`, status, hash do commit e ID do deployment.
6. Ao terminar, remover/desativar a flag e token no staging, e redeploy se necessário para revogar sua exposição.
7. As quatro workflows de reparação do GitHub devem permanecer `Disabled` e `MAINTENANCE_GATE=disabled` até homologação independente do PR #623 e nova autorização; **não reativar** nesta etapa.


## Procedimento de deploy isolado (autorizado pelo proprietário para staging; não é autorização de merge)

1. Confirmar **CI, Smoke e Playwright verdes no último commit**, e que Vercel `flipform-staging` possui apenas quatro variáveis existentes (`DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET_CURRENT`, `JWT_SECRET_PREVIOUS`). Não usar secrets produtivos do projeto `flipform`.
2. Criar **um deployment manual target Preview** do commit exato desta PR no projeto `prj_UOvo8lKGiIvp7IuBS4vtL9CnSZIu`. O `deploymentEnabled: false` protege contra deploy automático, sem impedir a publicação manual controlada.
3. O build fail-closed valida ambas as URLs e executa somente `SELECT current_database(), current_user`. Se falhar, interromper e não trocar conexões automaticamente, nem tentar outro destino.
4. Confirmar que o Preview não recebeu alias `flipform-staging.vercel.app` e que o deployment anterior de staging continua ativo.
5. Não habilitar o endpoint autenticado antes de definir token de alta entropia, forma segura de chamada e procedimento de revogação. Com a flag ausente, a rota retorna 404, e o Preview tem todas as demais rotas bloqueadas pelo middleware.
6. Guardar no PR somente evidências sanitizadas do build e do status do deployment. O resultado de build não substitui a chamada do endpoint autenticado no **runtime**.

## Limitações e aceite

- A URL allowlisted mapeia para um endpoint Neon de staging conhecido pelos metadados do provedor; a consulta ao banco confirma somente `current_database()` e `current_user`, **não lê uma função nativa de project/branch IDs Neon**, portanto não é prova criptográfica da identidade do projeto.
- O middleware desta branch bloqueia acessos HTTP às demais rotas no Preview, mas não substitui auditoria de integrações agendadas ou externas à requisição. O teste também não comprova schema/bootstrap funcional completo; apenas destino da conexão e identity check. Não usar em produção.
- O Neon de staging tem pooler desabilitado nesta data; se o pooling for ativado no futuro, a validação deverá ser revisada antes de mudar a URL.
- Sem token/flag o endpoint não consulta o banco e retorna 404. No projeto Vercel produtivo `flipform`, mesmo que alguém habilite a flag acidentalmente, a diferença de `VERCEL_PROJECT_ID` impede o acesso.
- **Gate de conclusão:** CI/Playwright e auditoria do código aprovados, ambiente staging isolado, teste controlado real do endpoint apenas após autorização, e integração externa bloqueada. Até então A2-D está **parcial**.

**Sem merge, alterações em produção, banco real, dados de clientes, Ads/Pixel, WhatsApp, Stripe, migração ou execuções administrativas.**
