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

Access tokens são trocados e usados apenas server-side, protegidos por `encryptIntegrationSecret`, e nunca aparecem em DTOs, URLs, logs ou no React. Chamadas Graph autenticadas usam `appsecret_proof` e timeout explícito.

## Required permissions

Os scopes server-side são `ads_read`, `ads_management` e `business_management`. Scopes enviados pelo navegador são ignorados. Na inspeção oficial por `debug_token`, a lista efetivamente concedida é a união normalizada e sem duplicatas entre `data.scopes` e os nomes `scope` válidos de `data.granular_scopes`. Entradas malformadas são ignoradas defensivamente, inclusive quando `target_ids`, se presente, não é um array. Os IDs nunca são interpretados como permissões nem persistidos nesta etapa; o diagnóstico sanitizado registra somente a quantidade de targets por scope. Uma autorização incompleta recebe estado `error`, não `authorized`.

## Business Login real

A configuração externa do Facebook Login for Business do FlipForm usa **System User Access Token**, incluindo a opção permanente/sem expiração, e concede acesso a Ad Accounts e Pixels. A inspeção vincula o token ao App ID da plataforma, aceita os tipos compatíveis `USER` e `SYSTEM_USER`, obtém o principal de `user_id` e usa exclusivamente `expires_at` validado como fonte de expiração; sua ausência representa um token permanente (`null`). Nenhum ID real, token ou secret é documentado.

## Access review requirement

Usuários autorizados do App podem testar em desenvolvimento. Tenants externos exigirão Advanced Access/App Review aplicável da Meta; não há tokens manuais, Graph API Explorer ou atalhos para aprovação.

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

Ainda não há descoberta ou seleção de Business, Ad Account, Pixel/Dataset, renovação completa do token ou revogação remota. A CAPI e o Pixel do navegador continuam usando exclusivamente `TenantIntegrationSettings` legado.

## Next step: Asset Discovery

O próximo trabalho descobrirá ativos autorizados e permitirá selecionar Business, conta de anúncios e fonte de dados, sem ativar automaticamente a CAPI universal.

## Próximos passos

1. OAuth / Business Login.
2. `TenantMetaConnection` e descoberta de ativos.
3. Migração gradual do Pixel e CAPI para a conexão universal.

## Facebook Login for Business

O `Business Login Configuration ID` é uma configuração única do Meta App do FlipForm em `PlatformMetaSettings`. Ele é cadastrado somente pelo Platform Admin, não é secreto e nunca pode ser escolhido ou sobrescrito por um tenant. A base Meta (App ID e App Secret) e a prontidão do Business Login (base mais Configuration ID) são status distintos e não afirmam que App Review ou Advanced Access foram aprovados.

O início do OAuth exige a configuração empresarial completa e inclui `config_id` exclusivamente a partir da configuração global server-side. Sem ela, a plataforma retorna uma indisponibilidade segura, sem fallback silencioso para OAuth baseado em scopes. `META_PLATFORM_REQUIRED_SCOPES` continua representando as permissões exigidas pelo produto e é validada após a autorização.

`TenantMetaConnection` permanece tenant-scoped e armazena somente a autorização individual de cada cliente. Nenhum App ID, App Secret, Configuration ID ou Redirect URI é configurado pelo tenant. O próximo passo é Asset Discovery de Businesses, Ad Accounts e Pixels/Datasets; este trabalho não implementa descoberta nem seleção de ativos.
