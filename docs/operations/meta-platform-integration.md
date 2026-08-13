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

No fluxo real de Facebook Login for Business com `SYSTEM_USER`, a Meta pode retornar um token válido sem repetir os escopos de Marketing API em `debug_token`. Nesse caso o FlipForm não inventa permissões. O `grantedScopes` continua armazenando somente o que a Meta efetivamente reportou, enquanto o gate de autorização passa a provar acesso real aos ativos selecionados.

## System User asset validation

Para `SYSTEM_USER`, depois de validar `is_valid`, `app_id`, tipo do token e `user_id`, o servidor consulta `/{system-user-id}/assigned_ad_accounts` com o token somente no header Authorization e `appsecret_proof`. A conexão só pode ser autorizada quando existe pelo menos uma conta de anúncios atribuída e pelo menos um Pixel acessível via `/act_{account_id}/adspixels`.

A validação não persiste Business ID, Ad Account ID ou Pixel ID neste estágio e não registra esses IDs em logs. A observabilidade contém apenas método de validação, contagens de contas/Pixels e scopes efetivamente reportados. Falta de conta atribuída ou Pixel mantém a conexão em `error`.

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

A validação confirma que o `SYSTEM_USER` possui conta de anúncios e Pixel acessíveis, mas ainda não persiste a seleção estruturada de Business, Ad Account ou Pixel/Dataset. A CAPI e o Pixel do navegador continuam usando exclusivamente `TenantIntegrationSettings` legado.

## Next step: Asset Discovery

O próximo trabalho persistirá de forma tenant-scoped os ativos autorizados/selecionados pelo Business Login para que a conexão universal possa substituir gradualmente a configuração manual legada.

## Próximos passos

1. OAuth / Business Login.
2. `TenantMetaConnection` e descoberta/persistência de ativos.
3. Migração gradual do Pixel e CAPI para a conexão universal.

## Facebook Login for Business

O `Business Login Configuration ID` é uma configuração única do Meta App do FlipForm em `PlatformMetaSettings`. Ele é cadastrado somente pelo Platform Admin, não é secreto e nunca pode ser escolhido ou sobrescrito por um tenant. A base Meta (App ID e App Secret) e a prontidão do Business Login (base mais Configuration ID) são status distintos e não afirmam que App Review ou Advanced Access foram aprovados.

O início do OAuth exige a configuração empresarial completa e inclui `config_id` exclusivamente a partir da configuração global server-side. Sem ela, a plataforma retorna uma indisponibilidade segura, sem fallback silencioso para OAuth baseado em scopes.

`TenantMetaConnection` permanece tenant-scoped e armazena somente a autorização individual de cada cliente. Nenhum App ID, App Secret, Configuration ID ou Redirect URI é configurado pelo tenant.
