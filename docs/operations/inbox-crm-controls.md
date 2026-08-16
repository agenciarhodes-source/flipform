# Inbox CRM Controls

## Objetivo

Adicionar controles explícitos para conectar a Inbox do Flipform ao CRM sem criar efeitos colaterais silenciosos no Kanban.

Este incremento permite:

- vincular uma conversa a um Lead existente;
- atribuir um responsável à conversa;
- resolver e reabrir uma conversa.

Não há criação automática de Lead neste PR.

## Segurança multi-tenant

Todas as ações derivam `tenantId`, `userId` e `role` da sessão autenticada. O browser nunca informa tenant, WABA, `phone_number_id` ou credenciais Meta.

As mutações fazem lock da linha de `Conversation` dentro de uma transação e repetem a validação do escopo da Inbox antes de atualizar.

Agentes continuam limitados às conversas que já pertencem ao seu escopo e só podem vincular Leads atribuídos a eles.

## Vínculo com Lead

A busca de Leads:

- exige pelo menos 2 caracteres;
- retorna no máximo 20 resultados;
- é limitada ao tenant;
- para agente, é limitada aos Leads atribuídos ao próprio agente.

Ao vincular:

- `Conversation.leadId` é preenchido;
- a `ExternalContactIdentity` correspondente recebe o mesmo `leadId`;
- uma conversa já vinculada a outro Lead não é relinkada silenciosamente; a API retorna conflito.

O PR não oferece unlink/relink destrutivo. Isso fica para um fluxo futuro com confirmação explícita.

## Responsável da conversa

Owner, admin e manager podem atribuir uma conversa a um usuário ativo do tenant que não seja `viewer`.

A atribuição altera somente `Conversation.assignedTo`.

Ela **não altera `Lead.assignedTo`**. Isso é proposital para evitar que uma ação na Inbox mude a propriedade comercial do Lead no Kanban sem uma ação específica do usuário.

## Resolver e reabrir

Usuários com `INBOX_MANAGE` podem resolver ou reabrir conversas dentro do próprio escopo.

Resolver:

- define `Conversation.status = resolved`;
- define `resolvedAt`;
- zera `unreadCount`.

Reabrir:

- define `Conversation.status = open`;
- limpa `resolvedAt`.

Nenhuma dessas ações altera:

- status do Lead;
- estágio do Lead;
- pipeline;
- histórico de estágio;
- vendas;
- pagamentos.

## Auditoria

As ações explícitas registram audit log best-effort para:

- vínculo da conversa ao Lead;
- atribuição de responsável;
- resolução;
- reabertura.

Falha de audit log não reverte a ação principal, seguindo o padrão existente do Flipform.

## UI

O menu `Ações` no cabeçalho da conversa exibe somente controles permitidos para o papel atual.

A Inbox também mantém proteção contra respostas assíncronas de uma conversa antiga sobrescreverem a conversa recém-selecionada.

## Production Data Safety

Este PR não cria migration e não executa:

- `DROP`;
- `TRUNCATE`;
- `deleteMany`;
- backfill;
- mass update;
- reset de schema;
- recriação de Leads ou mensagens.

As únicas mutações são pontuais, tenant-scoped e iniciadas explicitamente por um usuário autorizado.

## Próximos passos

Depois desta fundação, os próximos incrementos podem incluir:

1. criação controlada de Lead a partir de uma conversa ainda sem vínculo;
2. sincronização opcional e explícita entre responsável da conversa e responsável do Lead;
3. ações de pipeline dentro da Inbox;
4. Instagram Messaging;
5. automações e IA de pré-atendimento.
