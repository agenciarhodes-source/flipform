# WhatsApp Cloud API Runtime

## Objetivo

Este módulo conecta a fundação de WhatsApp Embedded Signup ao Conversation Core do FlipForm usando a WhatsApp Cloud API oficial da Meta.

Ele cobre quatro responsabilidades:

1. verificação do webhook público;
2. validação criptográfica de notificações POST;
3. roteamento de eventos para o tenant correto pelo `phone_number_id` previamente vinculado;
4. envio server-side de mensagens de texto usando a credencial de runtime do System User da plataforma.

A Inbox visual, automações, templates e mídia continuam fora deste PR.

## Endpoint público

Callback:

`/api/webhooks/meta/whatsapp`

Em produção, considerando o domínio atual do app, o callback esperado é:

`https://app.flipform.com.br/api/webhooks/meta/whatsapp`

### GET — challenge

O challenge usa a variável de ambiente:

`META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`

Esse valor deve ser configurado na Vercel e informado no painel de Webhooks do Meta App. O token não pertence a nenhum tenant e não é recebido do browser.

O endpoint exige:

- `hub.mode=subscribe`;
- `hub.verify_token` igual ao valor configurado;
- `hub.challenge` presente.

A comparação do verify token é feita em tempo constante.

### POST — assinatura

O corpo é lido como texto bruto antes do parse de JSON. O header `X-Hub-Signature-256` é validado com HMAC-SHA256 e o Meta App Secret já armazenado de forma criptografada na configuração da plataforma.

Payload sem assinatura válida recebe 401 e não chega ao Conversation Core.

## Resolução de tenant

O webhook não aceita `tenantId` do payload externo.

O fluxo é:

`metadata.phone_number_id`
→ `TenantWhatsAppConnection.phoneNumberId`
→ conexão com `status=connected`
→ `tenantId`
→ Conversation Core.

Se o número não estiver vinculado ou estiver revogado, o evento é ignorado sem tentar adivinhar tenant.

Isso preserva o isolamento entre clientes mesmo quando a credencial operacional da plataforma consegue administrar mais de um WABA.

## Mensagens inbound

Mensagens recebidas são normalizadas para o Conversation Core:

- `from` → `externalUserId` e telefone informado pelo WhatsApp;
- `id` → `externalMessageId`;
- `timestamp` → horário do provedor;
- `contacts[].profile.name` → nome de exibição quando presente;
- texto/caption/resposta interativa → `text`;
- tipo Meta → tipo universal do core;
- `phone_number_id`, WABA e contexto → metadata técnica.

A idempotência continua sendo garantida pelo Conversation Core e sua unique constraint de mensagem externa.

## Status de mensagem

Eventos de status atualizam mensagens pelo mesmo escopo:

`tenant + provider=meta + channel=whatsapp + externalMessageId`.

O runtime aceita `sent`, `delivered`, `read` e `failed`.

Status de sucesso são monotônicos: um evento atrasado de `sent` não rebaixa uma mensagem que já está `delivered` ou `read`. Um `failed` também não substitui uma mensagem já entregue/lida.

## Envio de texto

`sendWhatsAppTextMessage()` é um serviço server-side; não há endpoint público de envio neste PR.

O serviço recebe somente:

- `tenantId`;
- `conversationId`;
- texto;
- `sentByUserId` opcional.

Ele não aceita `phone_number_id`, WABA ou access token do caller.

Antes do request externo, o runtime:

1. confirma que a conversa é do tenant e do canal WhatsApp;
2. valida que o usuário remetente é membro ativo do tenant quando informado;
3. busca a conexão WhatsApp ativa do próprio tenant;
4. carrega App Secret + System User Access Token apenas no servidor;
5. envia para `/{Phone-Number-ID}/messages`;
6. persiste o ID `wamid...` devolvido pela Meta via `recordOutboundMessage()`;
7. reaproveita o hook existente de tracking de frases do funil para mensagens de agentes.

## Credenciais

O runtime usa somente:

- Meta App Secret;
- WhatsApp System User Access Token de runtime.

O Admin System User Access Token usado no Embedded Signup não é carregado por este módulo.

Credenciais não são retornadas para tenant/browser e não são escritas nos logs.

## Compatibilidade

O endpoint legado interno:

`/api/webhooks/whatsapp/message`

permanece inalterado e protegido por `INTERNAL_JOB_SECRET`/`CRON_SECRET`. Ele continua servindo apenas ao fluxo interno de tracking já existente e não é tratado como webhook oficial da Meta.

## Fora deste PR

- Inbox/chat UI;
- endpoint autenticado para agente enviar pela UI;
- templates;
- upload ou download de mídia;
- marcação de mensagens como lidas;
- criação automática de Lead;
- distribuição/round-robin;
- automações e IA;
- Instagram Messaging.

## Próximos passos

1. criar a Inbox usando `Conversation`/`Message`;
2. expor envio autenticado para agentes via service `sendWhatsAppTextMessage()`;
3. vincular operação da conversa ao Lead/Kanban;
4. tratar mídia/templates em PRs pequenos;
5. implementar Instagram no mesmo Conversation Core.

## Segurança de dados

Este PR não cria migration e não altera dados existentes de Leads, respostas, histórico, vendas, pipelines, formulários ou pagamentos.
