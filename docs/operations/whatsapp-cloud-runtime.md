# WhatsApp Cloud API Webhook Runtime

## Objetivo

Este módulo conecta a fundação de WhatsApp Embedded Signup ao Conversation Core do FlipForm para receber eventos oficiais da WhatsApp Cloud API com isolamento por tenant.

Ele cobre:

1. verificação do webhook público;
2. validação criptográfica de notificações POST;
3. roteamento por `phone_number_id` previamente vinculado;
4. persistência de mensagens inbound;
5. atualização segura de status de mensagens já conhecidas.

O envio outbound foi deliberadamente retirado deste PR. Ele será implementado em um PR separado com outbox/idempotência durável, para evitar o cenário em que a Meta aceita a mensagem mas uma falha local impede o registro do envio.

## Endpoint público

Callback:

`/api/webhooks/meta/whatsapp`

Em produção:

`https://app.flipform.com.br/api/webhooks/meta/whatsapp`

### GET — challenge

O challenge usa a variável de ambiente:

`META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`

Esse valor deve ser configurado na Vercel e informado no painel de Webhooks do Meta App. O token é de plataforma, não de tenant.

O endpoint exige:

- `hub.mode=subscribe`;
- `hub.verify_token` igual ao valor configurado;
- `hub.challenge` presente.

A comparação é feita em tempo constante.

### POST — assinatura

O corpo é lido como texto bruto antes do parse de JSON. O header `X-Hub-Signature-256` é validado com HMAC-SHA256 usando o Meta App Secret armazenado pela plataforma.

Payload sem assinatura válida recebe 401 e não chega ao Conversation Core.

O módulo de webhook carrega somente o App Secret. Tokens administrativos e System User Access Tokens não são carregados por esse endpoint.

## Resolução de tenant

O webhook não aceita `tenantId` do payload externo.

O fluxo é:

`metadata.phone_number_id`
→ `TenantWhatsAppConnection.phoneNumberId`
→ conexão com `status=connected`
→ `tenantId`
→ Conversation Core.

Se o número não estiver vinculado ou estiver revogado, o evento é ignorado sem tentar inferir tenant.

## Mensagens inbound

Mensagens recebidas são normalizadas para o Conversation Core:

- `from` → `externalUserId` e telefone informado pelo WhatsApp;
- `id` → `externalMessageId`;
- `timestamp` → horário do provedor;
- `contacts[].profile.name` → nome de exibição quando presente;
- texto/caption/resposta interativa → `text`;
- tipo Meta → tipo universal do core;
- `phone_number_id`, WABA e contexto → metadata técnica.

A idempotência é garantida pelo Conversation Core e sua unique constraint de mensagem externa.

## Status de mensagem

Eventos `sent`, `delivered`, `read` e `failed` são aplicados usando:

`tenant + provider=meta + channel=whatsapp + externalMessageId`.

A linha da mensagem é bloqueada com `SELECT ... FOR UPDATE` durante a transação. Isso serializa callbacks concorrentes e impede que um `sent` atrasado sobrescreva `delivered`/`read`.

Um `failed` também não rebaixa uma mensagem já entregue ou lida.

## Endpoint interno legado

`/api/webhooks/whatsapp/message`

permanece inalterado e protegido por `INTERNAL_JOB_SECRET`/`CRON_SECRET`. Ele continua sendo um endpoint interno de tracking e não é tratado como webhook oficial da Meta.

## Fora deste PR

- envio de mensagem pela Cloud API;
- outbox/idempotência outbound;
- Inbox/chat UI;
- templates;
- mídia;
- marcação de mensagens como lidas;
- criação automática de Lead;
- distribuição/round-robin;
- automações e IA;
- Instagram Messaging.

## Próximos passos

1. criar outbox durável para envio WhatsApp;
2. implementar envio server-side com idempotency key e reconciliação do `wamid`;
3. criar endpoint autenticado para agentes;
4. construir Inbox usando `Conversation`/`Message`;
5. vincular operação ao Lead/Kanban;
6. implementar Instagram no mesmo Conversation Core.

## Segurança de dados

Este PR não cria migration e não altera dados existentes de Leads, respostas, histórico, vendas, pipelines, formulários ou pagamentos.
