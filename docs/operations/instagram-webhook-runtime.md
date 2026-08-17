# Instagram Webhook Runtime

## Objetivo

Receber eventos de mensagens do Instagram profissional com isolamento por tenant e persistir mensagens inbound no Conversation Core do FlipForm.

Este módulo não envia Direct, não processa comentários e não cria Leads automaticamente.

## Callback público

Produção:

`https://app.flipform.com.br/api/webhooks/meta/instagram`

O endpoint aceita:

- `GET` para a verificação inicial do Webhooks Product;
- `POST` para Event Notifications assinadas pela Meta.

O Verify Token é uma configuração operacional do ambiente:

`META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN`

O mesmo valor deve ser configurado no App Dashboard da Meta para o webhook do Instagram.

## Segurança

- O corpo do `POST` é lido como texto bruto antes de qualquer `JSON.parse`.
- `X-Hub-Signature-256` é validado com HMAC SHA-256 e o Instagram App Secret dedicado da plataforma.
- O módulo de webhook carrega somente o Instagram App Secret; ele não carrega o access token da conta profissional.
- O tenant nunca é aceito do payload externo.
- `entry.id` é tratado como o Instagram Professional Account ID e resolvido contra `tenant_instagram_connections`.
- Somente bindings locais com status `connected` e sem revogação são aceitos.
- Payloads de contas desconhecidas ou desconectadas são ignorados, sem criar tenant, conexão ou Lead.

## Mensagens

O runtime processa somente eventos `object = instagram` com `entry[].messaging[].message` que possuam:

- ID da conta profissional em `entry.id`;
- sender Instagram-scoped ID;
- recipient igual à conta profissional;
- `message.mid`.

Eventos de echo/outbound são ignorados quando `message.is_echo = true` ou quando o sender é a própria conta profissional.

Mensagens inbound são gravadas por `recordInboundMessage` com:

- `provider = meta`;
- `channel = instagram`;
- `externalUserId = sender.id`;
- `externalMessageId = message.mid`.

A unicidade do Conversation Core mantém a ingestão idempotente mesmo se a Meta reenviar a mesma notificação.

URLs temporárias de anexos não são persistidas neste PR. Apenas tipos de anexo e IDs/contextos seguros são mantidos em metadata.

## Inscrição da conta profissional

Durante o Business Login, depois de validar a conta e a permissão de mensagens, o backend chama:

`/{IG_ID}/subscribed_apps`

com o campo `messages`, usando o Instagram User access token daquela conta. A conexão só é persistida depois que a inscrição retorna sucesso.

Além dessa inscrição por conta, o Instagram/Webhooks Product do Meta App precisa ter o callback e o campo `messages` configurados no App Dashboard.

## Escopo seguinte

PR posterior:

1. outbound de Direct com outbox/idempotência;
2. Inbox multicanal WhatsApp + Instagram;
3. `messaging_seen`/reactions/postbacks conforme necessário;
4. comentários + private reply;
5. automação comentário → DM dentro das janelas e limitações da Meta.
