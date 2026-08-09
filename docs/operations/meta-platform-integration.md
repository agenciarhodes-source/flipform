# Integração Meta da plataforma

## Arquitetura

O FlipForm utiliza um único Meta App oficial da plataforma para atender vários tenants. `PlatformMetaSettings` é um singleton global e não contém `tenantId`.

## Platform configuration

Somente usuários com `globalRole === "platform_admin"` acessam a configuração em `/admin/integrations` e na API administrativa. O App ID e os presets são globais.

## Tenant configuration

A autorização self-service de cada tenant será implementada futuramente. Esta fundação não executa OAuth, descoberta de ativos ou chamadas à Graph API.

## Secret storage

O App Secret é criptografado com `encryptIntegrationSecret` e a chave de infraestrutura `INTEGRATION_SECRET_KEY`. Plaintext e payload criptografado nunca fazem parte do DTO administrativo; a interface recebe apenas estado configurado e máscara não reversível.

## Redirect URI

A callback canônica é derivada server-side de `NEXT_PUBLIC_APP_URL` e `/api/integrations/meta/callback`. Ela é somente leitura e não é persistida no banco.

## Presets

Pixel, Conversions API, Advanced Matching, Attribution, QualifiedLead e Purchase começam habilitados. São defaults para conexões futuras e não atualizam tenants existentes.

## Legacy compatibility

`TenantIntegrationSettings` continua operacional temporariamente para Pixel ID, Access Token e Test Event Code de cada tenant. Não há backfill nem alteração desses dados neste trabalho.

## Próximos passos

1. OAuth / Business Login.
2. `TenantMetaConnection` e descoberta de ativos.
3. Migração gradual do Pixel e CAPI para a conexão universal.
