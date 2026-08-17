# Instagram outbound outbox

## Escopo

Este módulo adiciona envio de texto pelo Instagram Direct para conversas já iniciadas pelo usuário do Instagram. O envio usa a conexão Instagram Business Login do tenant e o Conversation/Message core existente.

## Endpoint interno da aplicação

`POST /api/conversations/:id/messages/instagram`

Body:

```json
{
  "text": "Olá!",
  "idempotencyKey": "client-generated-key"
}
```

O caller nunca envia tenantId, Instagram Professional Account ID, recipient ID, access token ou App Secret. Esses valores são resolvidos no servidor a partir da sessão, conversa e binding do tenant.

## Segurança e elegibilidade

- exige `INBOX_MANAGE`;
- agentes só enviam em conversa ou Lead atribuído a eles;
- a conversa deve pertencer ao tenant autenticado e ser `meta/instagram`;
- o destinatário é sempre `ExternalContactIdentity.externalUserId` da conversa;
- a conversa precisa possuir `lastInboundAt`, porque a Meta exige que o usuário do Instagram tenha iniciado a conversa antes da resposta da conta profissional;
- para um envio novo, o Instagram Professional Account ID gravado na mensagem inbound é comparado com a conta profissional atualmente conectada; conversas antigas de outra conta não podem ser enviadas pela conta nova;
- a conexão precisa estar ativa, com token não expirado e com confirmação auditável de `INSTAGRAM_WEBHOOK_SUBSCRIBED` para o binding atual;
- o access token é descriptografado apenas no servidor no momento do envio.

## Outbox durável

O próprio `Message` funciona como outbox, sem migration adicional.

Antes de qualquer request externo, é criado um `Message` outbound com:

- `externalMessageId` determinístico a partir de tenant + idempotency key;
- `status=queued`;
- metadata com fingerprint do conteúdo, binding e estado de dispatch.

O registro é travado com `FOR UPDATE` antes do dispatch. Uma mesma idempotency key com payload diferente é rejeitada.

Um retry idempotente consulta o item de outbox existente **antes** de exigir uma conexão Meta ainda válida. Assim, resultados já registrados continuam consultáveis mesmo se o token expirar ou a conexão for revogada posteriormente; nenhuma nova chamada externa é feita nesses casos.

## Lease do dispatch

Ao iniciar uma chamada externa, o item passa para `sending` e recebe `attemptStartedAt`. Esse estado funciona como lease curto.

Se outro request encontrar uma tentativa `sending` ainda dentro do lease, recebe `in_progress`. Se o lease já venceu, o item passa para `delivery_unknown` e **não é reenviado**. Isso cobre crash de processo, exceção após a request externa ou falha local depois de a Meta possivelmente ter aceitado a mensagem.

## Chamada Meta

O runtime chama a Send API oficial do Instagram com:

- host `graph.instagram.com`;
- versão definida por `INSTAGRAM_GRAPH_VERSION`;
- Instagram Professional Account ID vindo do binding do tenant;
- Instagram-scoped recipient ID vindo da identidade externa da conversa;
- Bearer token vindo da conexão criptografada do tenant.

Somente texto é suportado neste PR.

## Resultado ambíguo

Timeout, falha de rede, falha ao ler a resposta ou resposta 2xx sem `message_id` são tratados como `delivery_unknown`. O Flipform não repete automaticamente a chamada externa nesses casos, evitando duplicidade.

Uma falha explícita da Meta marca o item como `failed`. Um `message_id` aceito pela Meta é persistido antes da finalização local e o item passa para `sent`.

## Fora deste PR

- habilitar o composer do Instagram na Inbox;
- mídia, replies, reactions e templates;
- automação comentário -> DM;
- private replies;
- IA;
- retry manual/reconciliação operacional de `delivery_unknown`.
