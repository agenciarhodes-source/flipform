# WhatsApp outbound outbox

## Objetivo

Este módulo adiciona envio de texto pela WhatsApp Cloud API sem transformar falhas de rede, persistência ou callbacks concorrentes em mensagens duplicadas para o cliente.

O PR usa a própria tabela `messages` do Conversation Core como outbox. Não existe uma segunda cópia da conversa nem uma tabela paralela de mensagens.

## Fluxo

1. O endpoint autenticado recebe somente `text` e `idempotencyKey`.
2. Tenant e usuário vêm exclusivamente da sessão do FlipForm.
3. A conversa é resolvida por `tenantId + conversationId` e precisa ser `meta/whatsapp`.
4. O destinatário vem de `ExternalContactIdentity.externalUserId`; o cliente HTTP não informa destinatário, WABA, `phone_number_id` ou token.
5. A conexão WhatsApp ativa do tenant é resolvida no backend.
6. Antes de qualquer request para a Meta, uma `Message` outbound é persistida com `status=queued` e um `externalMessageId` local determinístico derivado da chave de idempotência.
7. O item é bloqueado com `SELECT ... FOR UPDATE` e passa para `dispatchState=sending` na metadata.
8. Somente então o backend chama a Cloud API.
9. Quando a Meta aceita a mensagem, o `wamid` retornado é persistido em `metadata.providerMessageId` antes da finalização local.
10. Recibos que tenham chegado cedo demais são reconciliados.
11. A atividade da conversa é avançada usando o horário de aceitação/envio, nunca o horário posterior de entrega ou leitura.
12. Webhooks posteriores avançam o status de forma monotônica sem alterar a ordenação da conversa.

## Idempotência

`idempotencyKey` é obrigatória no endpoint de envio.

O `externalMessageId` local é calculado com SHA-256 de `tenantId + idempotencyKey`, portanto duas requisições concorrentes do mesmo tenant com a mesma chave colidem na unique constraint já existente do Conversation Core.

Também é salvo um fingerprint de `conversationId + text`. Reutilizar a mesma chave para outro conteúdo ou outra conversa retorna conflito e nunca dispara um novo request externo.

A chave original não é salva; apenas seu hash é persistido.

## Falhas ambíguas

O ponto mais perigoso é uma interrupção depois que o request saiu do FlipForm mas antes de ser possível confirmar com segurança o resultado.

Nessa situação a metadata passa para `delivery_unknown`, ou permanece `sending` se o processo caiu abruptamente. O FlipForm deliberadamente não reenvia a mesma intenção automaticamente. Repetir o request externo poderia entregar a mesma mensagem duas vezes.

Se o `wamid` já tiver sido persistido, uma nova chamada com a mesma chave apenas reconcilia/finaliza o registro local e não chama a Meta outra vez.

## Recibos que chegam antes do `wamid` local

Existe uma microjanela possível entre a resposta de sucesso da Meta e a persistência do `wamid` na `Message`. Um callback `sent`, `delivered`, `read` ou `failed` pode chegar nesse intervalo.

Para não reconhecer e perder esse callback, recibos ainda sem mensagem correspondente são persistidos de forma idempotente na tabela já existente `webhook_events`, usando o provider interno `meta_whatsapp_status_buffer`.

Assim que `metadata.providerMessageId` é persistido, o outbound tenta reconciliar esses recibos. O próprio webhook também tenta novamente logo depois de bufferizar, cobrindo a corrida inversa em que o `wamid` termina de ser salvo durante o processamento do callback.

Após aplicação, o evento bufferizado recebe `processedAt` e deixa de ser pendente.

## Timestamps e ordenação da Inbox

`delivered` e `read` representam horário de recibo, não nova atividade de mensagem. Por isso esses callbacks atualizam o status/metadata da `Message`, mas não alteram `Conversation.lastMessageAt` nem `Conversation.lastOutboundAt`.

A atividade outbound é registrada na finalização do envio usando `providerAcceptedAt`. Mesmo se um callback tiver avançado a mensagem para `delivered` ou `read` antes da finalização, a conversa continua usando o horário original de envio.

## Tracking pós-envio

O tracking de funil por frase é executado somente depois que o envio já foi aceito e reconciliado localmente.

Esse tracking é best-effort: qualquer falha de banco/configuração/tracking é registrada em log, mas nunca transforma uma mensagem já aceita pela Meta em resposta HTTP de falha para o atendente.

## Credenciais

O endpoint de envio usa somente o System User Access Token de runtime, carregado por `lib/meta/whatsapp-send-credentials.ts`.

O módulo do webhook permanece isolado em `lib/meta/whatsapp-runtime-credentials.ts` e carrega somente o App Secret necessário para validar a assinatura. O Admin System User token do Embedded Signup não é carregado por nenhum dos dois runtimes.

Nenhum token ou App Secret é enviado ao navegador.

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

O webhook oficial permanece em:

`/api/webhooks/meta/whatsapp`

O status provider usa o `wamid`. Para itens do outbox, esse ID fica em `metadata.providerMessageId`, enquanto o `externalMessageId` local permanece estável para garantir idempotência de retries.

## Limites deste PR

Este PR envia apenas mensagens de texto. Não inclui templates, mídia, reações, reply-to, automações, IA ou Inbox visual.

Também não implementa retry automático para estados ambíguos. Esse comportamento é intencional e prioriza não duplicar mensagens.

## Production Data Safety

Este PR não cria migration e não altera em massa nenhum dado existente. Leads, respostas, histórico de etapas, vendas, pagamentos, pipelines, formulários e mensagens existentes permanecem intocados.
