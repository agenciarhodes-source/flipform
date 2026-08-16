# Instagram Business Login

## Objetivo

O FlipForm usa o fluxo oficial **Instagram API with Instagram Login / Business Login for Instagram** para conectar contas profissionais Business ou Creator sem misturar credenciais com Ads ou WhatsApp.

A conexão deste módulo é apenas a fundação de autenticação e persistência. Webhooks, recebimento/envio de Direct e automações entram em PRs posteriores.

## Limites por canal

- Ads continua em `tenant_meta_connections` e usa as credenciais Meta/Facebook configuradas para Ads/WhatsApp.
- WhatsApp continua em `tenant_whatsapp_connections` e usa credenciais técnicas da plataforma.
- Instagram usa **Instagram App ID + Instagram App Secret dedicados**, além de `tenant_instagram_connections` e um Instagram User access token próprio da conta profissional.
- Nenhum token ou App Secret do Instagram é salvo em `TenantMetaConnection`, `TenantWhatsAppConnection` ou entregue ao navegador.

## Fluxo

1. Usuário com `INTEGRATIONS_EDIT` inicia a conexão.
2. O servidor carrega o Instagram App ID/App Secret dedicados, somente no backend.
3. O servidor cria um state assinado e vinculado a `tenantId`, `userId` e ao propósito `instagram_business_login`.
4. O navegador é redirecionado ao Business Login for Instagram solicitando apenas:
   - `instagram_business_basic`
   - `instagram_business_manage_messages`
5. O callback valida state, sessão e tenant.
6. O código OAuth é trocado por um token de usuário do Instagram e depois por token de longa duração usando as credenciais do produto Instagram.
7. O backend valida a conta profissional em `graph.instagram.com` e faz uma chamada mínima à Conversations API para confirmar acesso de mensagens.
8. O token final é criptografado antes da persistência.
9. O Instagram User ID possui binding global único no FlipForm para impedir que o mesmo ativo seja ligado acidentalmente a tenants diferentes.

## Persistência

A migration `20260816222000_add_tenant_instagram_connections` é estritamente aditiva. Ela adiciona os campos globais `instagram_app_id` e `instagram_app_secret_encrypted` às configurações da plataforma e cria `tenant_instagram_connections` com índices/FKs, sem apagar ou fazer backfill em dados existentes.

A tabela também está representada por `TenantInstagramConnection` em `schema.prisma`, mantendo o Prisma schema alinhado à migration e ao banco materializado pelos testes.

Campos operacionais sensíveis permanecem no servidor. A API de status retorna somente ID da conexão, Instagram User ID, username, status e timestamps seguros. Quando `token_expires_at` já passou, o status é derivado como `expired`, nunca como conectado.

## Segurança

- O browser não fornece `tenantId`, Instagram User ID ou token para a persistência.
- O tenant vem da sessão autenticada.
- OAuth state é assinado e não pode ser reutilizado entre Ads, WhatsApp e Instagram.
- Instagram App Secret e Instagram User access token são criptografados server-side.
- O serviço serializa alterações por tenant com `FOR UPDATE` antes de substituir uma conexão ativa.
- O mesmo Instagram User ID não pode ficar vinculado a tenants diferentes.
- Disconnect revoga somente o binding local e preserva histórico. Revogação remota do token pode ser adicionada quando o runtime completo for implementado.

## Configuração Meta

No Super Admin do FlipForm, configure separadamente o **Instagram App ID** e o **Instagram App Secret** mostrados no produto Instagram. Eles não são inferidos das credenciais usadas por Ads/WhatsApp.

Autorize no Business Login for Instagram o redirect URI:

`https://app.flipform.com.br/api/integrations/instagram/callback`

Em ambiente local/staging, o redirect é derivado de `NEXT_PUBLIC_APP_URL`.

O fluxo com Instagram Login não exige uma Página do Facebook vinculada à conta profissional. Para mensagens, a conta precisa ser profissional e conceder `instagram_business_basic` e `instagram_business_manage_messages`.

## Próximos passos

1. Webhook oficial do Instagram e resolução tenant-safe pelo Instagram Professional Account ID.
2. Persistência inbound no Conversation Core usando `channel = instagram`.
3. Envio de Direct com idempotência/outbox.
4. Inbox multicanal WhatsApp + Instagram.
5. Webhooks de comentários e private reply para automações do tipo comentário → DM, respeitando as janelas e restrições da Meta.
