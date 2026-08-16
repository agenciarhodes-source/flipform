# Conversation Core

## Objetivo

O Conversation Core é a camada multicanal do Flipform responsável por representar identidade externa, conversa e mensagem sem depender de credenciais ou endpoints específicos da Meta. Ele nasce preparado para WhatsApp e Instagram e será consumido pelos runtimes oficiais desses canais nos próximos PRs.

## Modelos

### ExternalContactIdentity

Representa a identidade de uma pessoa em um canal externo dentro de um tenant. A chave lógica é `tenant + provider + channel + externalUserId`, portanto o mesmo identificador externo pode existir em tenants diferentes sem colisão. Nome, username, telefone e e-mail são metadados opcionais; nenhum desses dados é inventado para criar uma identidade.

O vínculo com `Lead` é opcional. Isso permite que uma conversa de Instagram exista apenas com o identificador scoped da Meta e seja associada ao CRM depois que houver dados suficientes ou uma decisão explícita do fluxo.

### Conversation

Representa a thread de atendimento entre um tenant e uma identidade externa. O core mantém uma thread por `tenant + provider + channel + identity`, evitando a criação concorrente de duas conversas para o mesmo contato/canal. A conversa pode existir sem Lead, pode ser atribuída a um usuário do tenant e possui estado simples (`open`, `pending`, `resolved`) preparado para a futura Inbox.

`unreadCount`, `lastMessageAt`, `lastInboundAt` e `lastOutboundAt` são persistidos porque serão filtros/ordenações frequentes na Inbox. Este PR não implementa a interface de leitura ou notificações.

### Message

Representa mensagens inbound/outbound de forma provider-independent. Toda mensagem persistida neste core exige `externalMessageId`: o runtime grava a mensagem depois que o provedor forneceu seu ID oficial. Há uma unique constraint por `tenant + provider + channel + externalMessageId`.

Essa constraint é a última linha de defesa contra reentrega de webhooks e corridas concorrentes. O service layer também trata P2002 e retorna a mensagem já persistida sem incrementar novamente o contador de não lidas. Caso futuramente seja necessário representar uma mensagem local antes do ID oficial do provedor, isso deverá ser modelado explicitamente como outbox/draft, e não enfraquecendo a idempotência de `Message`.

## Multi-tenancy

Todos os três modelos possuem `tenantId` e índices tenant-scoped. O service layer exige `tenantId` nas operações e nunca resolve identidade, conversa, mensagem, Lead ou responsável apenas pelo identificador externo.

O Conversation Core não aceita tenant vindo de um webhook público. No próximo PR, o runtime WhatsApp deverá resolver `phone_number_id -> TenantWhatsAppConnection -> tenantId` antes de chamar este core. O mesmo princípio será aplicado ao Instagram através do asset previamente vinculado ao tenant.

## Idempotência e concorrência

`recordInboundMessage` usa:

1. lookup tenant-scoped para o replay comum;
2. `upsert` para identidade;
3. `upsert` para conversa;
4. criação de Message dentro da mesma transação;
5. unique constraint para `externalMessageId`;
6. recuperação da mensagem vencedora quando duas requisições concorrentes colidem em P2002.

Assim, um webhook repetido não cria duas mensagens e não incrementa `unreadCount` duas vezes.

## Relacionamento com Lead

Conversa e identidade podem nascer sem Lead. `linkConversationToLead` somente vincula um Lead existente depois de validar que Lead e Conversation pertencem ao mesmo tenant. Este PR não cria Leads automaticamente, não altera validações de criação manual e não copia telefone/e-mail para o CRM.

Um mesmo Lead poderá possuir conversas de canais diferentes, por exemplo uma thread WhatsApp e uma thread Instagram.

## WhatsApp

O próximo runtime deve resolver o tenant usando o `phone_number_id` já vinculado em `TenantWhatsAppConnection`, normalizar o evento oficial da Meta e chamar `recordInboundMessage`. Credenciais, WABA, System User token e App Secret ficam fora deste módulo.

## Instagram

Quando a conexão Instagram for implementada, o Instagram Scoped User ID será usado como `externalUserId`. O core não exige Facebook Page, telefone ou e-mail e, por isso, não bloqueia o início da conversa.

## Limites deste PR

Este PR não implementa webhook público, envio Cloud API, registro do número, templates, mídia, Inbox visual, Instagram Login/Messaging, automações ou IA.

## Próximos passos

1. webhook oficial WhatsApp + verificação de assinatura/challenge;
2. roteamento `phone_number_id -> tenant`;
3. normalização de mensagens/statuses e uso do Conversation Core;
4. envio pela WhatsApp Cloud API;
5. Inbox e vínculo operacional com Lead/Kanban;
6. conexão e runtime do Instagram;
7. automações estilo ManyChat.

## Segurança de dados de produção

A migration deste PR é estritamente aditiva: cria apenas novas tabelas, índices e foreign keys. Não há `DELETE`, `TRUNCATE`, `DROP`, `UPDATE` de registros existentes, backfill de Leads ou recriação de dados de clientes.
