# Instagram Business Login

## Objetivo

O FlipForm usa o fluxo oficial **Instagram API with Instagram Login / Business Login for Instagram** para conectar contas profissionais Business ou Creator sem misturar credenciais com Ads ou WhatsApp.

A conexão deste módulo é apenas a fundação de autenticação e persistência. Webhooks, recebimento/envio de Direct e automações entram em PRs posteriores.

## Limites por canal

- Ads continua em `tenant_meta_connections`.
- WhatsApp continua em `tenant_whatsapp_connections` e usa credenciais técnicas da plataforma.
- Instagram passa a usar `tenant_instagram_connections` e um Instagram User access token próprio da conta profissional.
- Nenhum token do Instagram é salvo em `TenantMetaConnection` ou entregue ao navegador.

## Fluxo

1. Usuário com `INTEGRATIONS_EDIT` inicia a conexão.
2. O servidor cria um state assinado e vinculado a `tenantId`, `userId` e ao propósito `instagram_business_login`.
3. O navegador é redirecionado ao Business Login for Instagram solicitando apenas:
   - `instagram_business_basic`
   - `instagram_business_manage_messages`
4. O callback valida state, sessão e tenant.
5. O código OAuth é trocado por um token de usuário do Instagram e depois por token de longa duração.
6. O backend valida a conta profissional em `graph.instagram.com` e faz uma chamada mínima à Conversations API para confirmar acesso de mensagens.
7. O token final é criptografado antes da persistência.
8. O Instagram User ID possui binding global único no FlipForm para impedir que o mesmo ativo seja ligado acidentalmente a tenants diferentes.

## Persistência

A migration `20260816222000_add_tenant_instagram_connections` é estritamente aditiva. Ela cria a tabela e índices/FKs, sem alterar, apagar ou fazer backfill em dados existentes.

Campos operacionais sensíveis permanecem no servidor. A API de status retorna somente ID da conexão, Instagram User ID, username, status e timestamps seguros.

## Segurança

- O browser não fornece `tenantId`, Instagram User ID ou token para a persistência.
- O tenant vem da sessão autenticada.
- OAuth state é assinado e não pode ser reutilizado entre Ads, WhatsApp e Instagram.
- O token é criptografado com o mesmo mecanismo server-side usado pelas demais integrações sensíveis.
- O serviço serializa alterações por tenant com `FOR UPDATE` antes de substituir uma conexão ativa.
- O mesmo Instagram User ID não pode ficar vinculado a tenants diferentes.
- Disconnect revoga somente o binding local e preserva histórico. Revogação remota do token pode ser adicionada quando o runtime completo for implementado.

## Configuração Meta

O Meta App da plataforma precisa ter o produto Instagram configurado e o redirect URI abaixo autorizado no Business Login for Instagram:

`https://app.flipform.com.br/api/integrations/instagram/callback`

Em ambiente local/staging, o redirect é derivado de `NEXT_PUBLIC_APP_URL`.

O fluxo com Instagram Login não exige uma Página do Facebook vinculada à conta profissional. Para mensagens, a conta precisa ser profissional e conceder `instagram_business_basic` e `instagram_business_manage_messages`.

## Próximos passos

1. Webhook oficial do Instagram e resolução tenant-safe pelo Instagram Professional Account ID.
2. Persistência inbound no Conversation Core usando `channel = instagram`.
3. Envio de Direct com idempotência/outbox.
4. Inbox multicanal WhatsApp + Instagram.
5. Webhooks de comentários e private reply para automações do tipo comentário → DM, respeitando as janelas e restrições da Meta.
