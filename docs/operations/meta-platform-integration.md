# Integração Meta da plataforma

## Arquitetura

O FlipForm utiliza um único Meta App oficial da plataforma para atender vários tenants. `PlatformMetaSettings` é um singleton global e não contém `tenantId`.

## Platform configuration

Somente usuários com `globalRole === "platform_admin"` acessam a configuração em `/admin/integrations` e na API administrativa. O App ID e os presets são globais.

## Platform Meta App

O Meta App é criado e aprovado externamente uma única vez pela equipe FlipForm. App ID e App Secret são configurados pelo Super Admin; o código não cria Apps nem presume aprovação.

## OAuth flow

Owners e admins iniciam `POST /api/integrations/meta/connect`. O servidor usa Graph API `v26.0`, monta a URL oficial e a callback fixa. A callback troca o authorization code server-side, inspeciona o token com `debug_token` autenticado pelo App da plataforma e redireciona somente para `/integrations`.

## Tenant authorization

Cada tenant autoriza sua própria identidade Meta. `TenantMetaConnection` guarda a autorização e quem a realizou, sem limitar o banco a uma única conexão futura por tenant. Reautorizações da mesma identidade atualizam o registro; outra autorização ativa anterior é revogada logicamente.

## State / CSRF protection

O state usa nonce aleatório de 32 bytes e cookie autenticado por HMAC, HttpOnly, SameSite Lax, Secure em produção e TTL de dez minutos. O payload vincula tenant, usuário e expiração à sessão. O cookie é removido no callback e não existe return URL arbitrária.

## Token encryption

Access tokens são trocados e usados apenas server-side, protegidos por `encryptIntegrationSecret`, e nunca aparecem em DTOs, URLs, logs ou no React. Chamadas Graph autenticadas usam Bearer token server-side, `appsecret_proof` quando aplicável e timeout explícito.

## Required permissions

Os scopes de produto continuam sendo `ads_read`, `ads_management` e `business_management`. Scopes enviados pelo navegador são ignorados. Para tokens `USER`, a autorização exige que todos os scopes estejam presentes na união normalizada de `data.scopes` e `data.granular_scopes` retornada por `debug_token`.

A integração universal de Marketing API do FlipForm usa `USER` como baseline operacional enquanto o Meta App não possui todos os requisitos externos necessários para operar `SYSTEM_USER` sobre ativos de clientes. A Meta exige permissões de Marketing API e, para gerenciar contas de anúncios de terceiros, Advanced Access aplicável.

## Long-lived USER token

Depois do Business Login retornar um token `USER` válido, o callback faz uma troca server-side com `grant_type=fb_exchange_token`. O token novo é novamente inspecionado com `debug_token`; somente o token long-lived revalidado é criptografado e persistido em `TenantMetaConnection`.

O token curto inicial nunca é salvo quando a extensão foi concluída. A expiração persistida continua vindo de `debug_token.expires_at`; o FlipForm não inventa uma data de expiração.

## System User asset validation

O código mantém compatibilidade com `SYSTEM_USER` para uma fase posterior. Nos testes reais anteriores do Business Login, a Meta retornou um `SYSTEM_USER` válido, porém somente com `public_profile`; chamadas de Marketing API para contas de anúncios retornaram erro de permissão. Por isso esse modo não é o baseline atual da integração universal.

Quando o App tiver os requisitos externos necessários, o caminho `SYSTEM_USER` poderá ser revalidado com acesso real aos ativos. O FlipForm não sintetiza `ads_read`, `ads_management` ou `business_management` quando a Meta não os concede.

## Business Login real

A configuração externa recomendada do Facebook Login for Business do FlipForm deve usar **Token de acesso do usuário (USER)** e incluir Ad Accounts, Pixels e as permissões `ads_read`, `ads_management` e `business_management`. O `Business Login Configuration ID` dessa configuração é salvo globalmente em `PlatformMetaSettings`.

A inspeção vincula o token ao App ID da plataforma, obtém o principal de `user_id` e valida os scopes concedidos. Nenhum ID real, token ou secret é documentado.

## Access review requirement

Usuários autorizados do App podem testar em desenvolvimento. Para tenants externos, a Meta exige o nível de acesso aplicável às permissões utilizadas; para contas de anúncios de terceiros, `ads_read` e/ou `ads_management` precisam de Advanced Access conforme o uso. Business verification/App Review continuam requisitos externos da plataforma e não são contornados pelo código.

## Tenant configuration

A configuração global pertence à plataforma, enquanto tokens OAuth pertencem ao tenant e são sempre consultados pelo `tenantId` da sessão. A API de status expõe apenas disponibilidade, estado, nome informativo, datas e scopes concedidos.

## Secret storage

O App Secret é criptografado com `encryptIntegrationSecret` e a chave de infraestrutura `INTEGRATION_SECRET_KEY`. Plaintext e payload criptografado nunca fazem parte do DTO administrativo; a interface recebe apenas estado configurado e máscara não reversível.

## Redirect URI

A callback canônica é derivada server-side de `NEXT_PUBLIC_APP_URL` e `/api/integrations/meta/callback`. Ela é somente leitura e não é persistida no banco.

## Presets

Pixel, Conversions API, Advanced Matching, Attribution, QualifiedLead e Purchase começam habilitados. São defaults para conexões futuras e não atualizam tenants existentes.

## Legacy compatibility

`TenantIntegrationSettings` continua operacional temporariamente para Pixel ID, Access Token e Test Event Code de cada tenant. Não há backfill nem alteração desses dados neste trabalho.

## Current limitations

A conexão OAuth ainda não persiste a seleção estruturada de Business, Ad Account ou Pixel/Dataset. A CAPI e o Pixel do navegador continuam usando exclusivamente `TenantIntegrationSettings` legado até o PR de Asset Discovery e migração gradual.

## Next step: Asset Discovery

Depois da autorização USER real ficar verde, o próximo trabalho persistirá de forma tenant-scoped os ativos autorizados/selecionados pelo Business Login para que a conexão universal possa substituir gradualmente a configuração manual legada.

## Próximos passos

1. OAuth / Business Login com USER token long-lived.
2. `TenantMetaConnection` e descoberta/persistência de ativos.
3. Migração gradual do Pixel e CAPI para a conexão universal.
4. App Review / Advanced Access para tenants externos conforme as permissões usadas.

## Facebook Login for Business

O `Business Login Configuration ID` é uma configuração única do Meta App do FlipForm em `PlatformMetaSettings`. Ele é cadastrado somente pelo Platform Admin, não é secreto e nunca pode ser escolhido ou sobrescrito por um tenant. A base Meta (App ID e App Secret) e a prontidão do Business Login (base mais Configuration ID) são status distintos e não afirmam que App Review ou Advanced Access foram aprovados.

O início do OAuth exige a configuração empresarial completa e inclui `config_id` exclusivamente a partir da configuração global server-side. Sem ela, a plataforma retorna uma indisponibilidade segura, sem fallback silencioso para OAuth baseado em scopes.

`TenantMetaConnection` permanece tenant-scoped e armazena somente a autorização individual de cada cliente. Nenhum App ID, App Secret, Configuration ID ou Redirect URI é configurado pelo tenant.
