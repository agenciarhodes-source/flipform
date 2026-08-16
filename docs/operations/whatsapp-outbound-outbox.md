# WhatsApp outbound outbox

## Objetivo

Este módulo adiciona envio de texto pela WhatsApp Cloud API sem transformar uma falha de rede ou de persistência em mensagens duplicadas para o cliente.

O PR usa a própria tabela `messages` do Conversation Core como outbox. Não existe uma segunda cópia da conversa nem uma tabela paralela de mensagens.

## Fluxo

1. O endpoint autenticado recebe `text` e `idempotencyKey`.
2. O tenant e o usuário vêm exclusivamente da sessão do FlipForm.
3. A conversa é resolvida por `tenantId + conversationId` e precisa ser `meta/whatsapp`.
4. O destinatário vem de `ExternalContactIdentity.externalUserId`; o cliente HTTP não pode informar destinatário, WABA, `phone_number_id` ou token.
5. A conexão ativa do tenant é resolvida no backend.
6. Antes de qualquer request para a Meta, uma `Message` outbound é persistida com `status=queued` e um `externalMessageId` local determinístico derivado da chave de idempotência.
7. O item é bloqueado com `SELECT ... FOR UPDATE` e passa para `dispatchState=sending` na metadata.
8. Somente então o backend faz `POST /{phone-number-id}/messages` na Graph API.
9. Quando a Meta aceita a mensagem, o `wamid` retornado é persistido em `metadata.providerMessageId` antes da finalização local.
10. A mensagem local passa para `sent` e a atividade da conversa é avançada de forma monotônica.
11. Webhooks posteriores localizam a mensagem tanto pelo ID externo tradicional quanto por `metadata.providerMessageId` e avançam `sent -> delivered -> read` sem regressão.

## Idempotência

`idempotencyKey` é obrigatória no endpoint de envio.

O `externalMessageId` local é calculado com SHA-256 de `tenantId + idempotencyKey`, portanto duas requisições concorrentes do mesmo tenant com a mesma chave colidem na unique constraint já existente do Conversation Core.

Também é salvo um fingerprint de `conversationId + text`. Reutilizar a mesma chave para outro conteúdo ou outra conversa retorna conflito e nunca dispara um novo request externo.

A chave original não é salva; apenas seu hash é persistido.

## Falhas ambíguas

O ponto mais perigoso é uma interrupção depois que o request saiu do FlipForm mas antes de ser possível confirmar com segurança o resultado.

Nessa situação a metadata passa para `delivery_unknown`, ou permanece `sending` se o processo caiu abruptamente. O FlipForm deliberadamente não reenvia a mesma intenção automaticamente. Uma repetição poderia entregar a mesma mensagem duas vezes ao cliente.

Se o `wamid` já tiver sido persistido, uma nova chamada com a mesma chave apenas reconcilia/finaliza o registro local e não chama a Meta outra vez.

## Credenciais

O endpoint de envio usa somente o System User Access Token de runtime. O Admin System User token utilizado no Embedded Signup não é carregado pelo módulo de envio.

O token é lido e descriptografado apenas no servidor. Nenhum token, App Secret, WABA ou `phone_number_id` é aceito no payload do endpoint de conversa.

## Autorização

A rota usa `LEADS_CONTACT_WHATSAPP`.

Além do RBAC da rota, o service valida novamente que o usuário é membro ativo do tenant. Para `agent`, a conversa ou o Lead vinculado precisa estar atribuído ao próprio usuário. `viewer` não possui a permissão de contato.

## Endpoint

`POST /api/conversations/{conversationId}/messages/whatsapp`

Payload:

```json
{
  "text": "Olá! Como posso ajudar?",
  "idempotencyKey": "4ee17b32-e132-4e39-9e56-4d75415c6e42"
}
```

Resultados relevantes:

- `200`: mensagem aceita e persistida localmente;
- `202`: envio em processamento ou resultado externo ambíguo; o FlipForm não repete automaticamente;
- `403`: usuário não pode operar a conversa;
- `404`: conversa não pertence ao tenant;
- `409`: WhatsApp não conectado ou chave reutilizada com payload diferente;
- `502`: rejeição definitiva conhecida antes da aceitação da mensagem.

## Webhook

O webhook oficial criado no PR anterior continua em:

`/api/webhooks/meta/whatsapp`

O status provider usa o `wamid`. Para itens do outbox, esse ID fica em `metadata.providerMessageId`, enquanto o `externalMessageId` local permanece estável para garantir idempotência de retries.

## Limites deste PR

Este PR envia apenas mensagens de texto. Não inclui templates, mídia, reações, reply-to, automações, IA ou Inbox visual.

Também não implementa retry automático para estados ambíguos. Esse comportamento é intencional e prioriza não duplicar mensagens.

## Production Data Safety

Este PR não cria migration e não altera em massa nenhum dado existente. Leads, respostas, histórico de etapas, vendas, pagamentos, pipelines e formulários permanecem intocados.
