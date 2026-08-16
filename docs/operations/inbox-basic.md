# Inbox básica do Flipform

## Objetivo

A Inbox é a primeira interface operacional construída sobre o Conversation Core. Ela permite que usuários autorizados vejam conversas e o histórico persistido, e que perfis com permissão de contato enviem texto pelo WhatsApp usando o runtime seguro já existente.

Este PR não cria um novo modelo de mensagens e não adiciona migration. Ele reutiliza `ExternalContactIdentity`, `Conversation` e `Message`.

## Multi-tenancy e escopo de acesso

Toda leitura parte da sessão autenticada e sempre inclui `tenantId` no filtro server-side.

- owner/admin/manager/viewer com `INBOX_VIEW` podem visualizar as conversas do próprio tenant;
- agent com `INBOX_VIEW` só pode visualizar conversas explicitamente atribuídas a ele ou vinculadas a um Lead atribuído a ele;
- o cliente nunca envia `tenantId` como fonte de autoridade;
- uma conversa é revalidada pelo servidor antes de carregar mensagens ou alterar o contador de não lidas.

`viewer` permanece somente leitura: ele pode abrir o histórico, mas não usa `INBOX_MANAGE` e não altera o contador de não lidas.

## APIs

### `GET /api/inbox/conversations`

Retorna até 100 conversas recentes dentro do escopo do usuário, com identidade externa, Lead vinculado, responsável e a mensagem mais recente.

Filtros opcionais suportados:

- `status`: `open`, `pending`, `resolved`;
- `channel`: `whatsapp`, `instagram`.

### `GET /api/inbox/conversations/{id}/messages`

Retorna as 200 mensagens mais recentes da conversa acessível, em ordem cronológica para renderização.

### `POST /api/inbox/conversations/{id}/read`

Disponível somente para `INBOX_MANAGE`. Zera `unreadCount` da conversa acessível, sem apagar ou alterar mensagens históricas.

## Envio WhatsApp

A Inbox não implementa um segundo runtime de envio. Ela chama o endpoint já protegido:

`POST /api/conversations/{id}/messages/whatsapp`

O navegador envia apenas:

- `text`;
- `idempotencyKey`.

O navegador não escolhe destinatário, WABA, `phone_number_id`, token, App Secret ou System User. Esses valores continuam sendo derivados e validados exclusivamente no servidor.

Cada tentativa criada pela interface usa uma nova chave de idempotência. O outbox durável do runtime continua sendo a fonte de verdade para retries, falhas ambíguas e reconciliação de status.

## Atualização da interface

A Inbox usa polling leve nesta primeira versão:

- lista de conversas: a cada 12 segundos;
- mensagens da conversa aberta: a cada 5 segundos.

WebSocket/SSE pode substituir esse mecanismo depois, sem mudar o domínio persistido.

## Instagram

O Conversation Core já é multicanal, por isso conversas Instagram podem ser renderizadas se existirem. O envio de Direct ainda não faz parte deste PR e a interface deixa isso explícito.

## Fora do escopo

- templates WhatsApp;
- anexos/mídia;
- áudio;
- reply-to;
- atribuição pela Inbox;
- resolver/reabrir conversa pela UI;
- criação automática de Lead;
- automações;
- IA;
- Instagram Login/Messaging;
- tempo real por WebSocket/SSE.

## Segurança de dados de produção

Não há migration neste PR e nenhuma rotina de backfill ou atualização em massa.

A única mutação nova da Inbox é zerar `Conversation.unreadCount` de uma conversa específica e previamente autorizada quando um usuário com `INBOX_MANAGE` a abre. Leads, respostas, histórico de estágio, vendas, pagamentos, pipelines, formulários e mensagens existentes não são apagados, recriados ou modificados em massa.
