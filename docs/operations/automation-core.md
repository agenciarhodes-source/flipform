# Automation Core v1

## Objetivo

O `lib/automation/` é a fundação genérica para futuras automações do FlipForm. Ele separa o motor de automação dos provedores Meta e dos módulos de CRM, permitindo que Instagram, WhatsApp e outros adapters compartilhem a mesma disciplina de versionamento, fila durável, idempotência e retry.

Este módulo entra de forma **aditiva**. Ele não substitui nem altera a automação de comentário do Instagram já existente nesta etapa.

## Persistência sem migration

A primeira versão reutiliza estruturas já existentes:

- `AuditLog` guarda snapshots append-only das definições (`automation_definition_v1`);
- `WebhookEvent` funciona como outbox/fila durável das execuções (`automation_execution_v1`).

Não há tabela nova, migration, backfill ou alteração do `schema.prisma`.

Cada definição possui `id`, `versionId`, `versionNumber`, `trigger`, lista ordenada de `actions`, `enabled` e `orderIndex`. Atualizações criam uma nova versão em vez de sobrescrever histórico.

## Trigger adapters

O core não consulta Meta, não recebe webhooks e não decide regras específicas de canal. Um adapter futuro deverá:

1. receber/validar o evento do provedor;
2. resolver o tenant pelo binding oficial do canal;
3. buscar definições habilitadas pelo `trigger.type`;
4. aplicar as condições específicas daquele trigger;
5. persistir o evento de origem e chamar `enqueueAutomationExecution(...)` na mesma transação quando atomicidade for necessária.

O `sourceEventKey` deve ser estável para o evento externo. O core deriva um SHA-256 com tenant + definição + source event para impedir que o mesmo evento execute novamente após uma mudança de versão. A versão exata usada na primeira decisão continua persistida no job e é validada pelo worker.

## Action handlers

A execução recebe explicitamente um mapa de `AutomationActionHandler`. O core não faz chamadas HTTP nem carrega tokens de provedores.

Cada handler recebe:

- tenant e definição;
- trigger/action configurados;
- input sanitizado do evento;
- número da tentativa;
- `idempotencyKey` estável por execução + ação.

**Contrato obrigatório do handler:** qualquer ação externa precisa ser idempotente com essa chave. Se o resultado externo for ambíguo, o handler deve retornar `delivery_unknown`; o core trata esse estado como terminal e não faz blind retry.

## Estados e retry

Estados persistidos:

- `queued`
- `processing`
- `completed`
- `failed`
- `delivery_unknown`
- `skipped`

O worker usa `FOR UPDATE SKIP LOCKED`, lease de 2 minutos, token de fencing por tentativa, cursor de ação e no máximo 3 tentativas internas. Linhas com lease ainda ativo são filtradas antes do `LIMIT`, e qualquer write de cursor/release/finalização exige o token da tentativa que fez o claim. Definição removida, desabilitada ou alterada de versão antes da execução é marcada como `skipped` em vez de executar uma configuração diferente da que originou o job.

O cursor é persistido após cada ação concluída. Mesmo assim, um crash entre o efeito externo e a gravação local ainda pode repetir a chamada; por isso a idempotência do handler é requisito de segurança, não otimização.

## Limites de payload

O core aceita apenas JSON puro e rejeita objetos com protótipos, referências circulares, números não finitos e chaves perigosas. Limites atuais:

- config de trigger/ação: 16 KiB;
- input de execução: 32 KiB;
- definição completa: 64 KiB;
- até 20 ações por definição.

Adapters não devem colocar access tokens, App Secrets, PINs ou outras credenciais no `executionInput`.

## Segurança de dados

Este módulo não lê nem altera `Lead`, Kanban, Pipeline, Conversation, Message ou histórico de CRM. A única escrita operacional nova é em snapshots de `AuditLog` e jobs de `WebhookEvent` criados por chamadas futuras explícitas do motor.

## Fora de escopo desta etapa

- migrar a automação existente de comentário do Instagram;
- editor visual;
- endpoints públicos/clientes para CRUD genérico;
- registro automático de handlers;
- cron central;
- criação/qualificação de Lead;
- movimentação de Kanban;
- IA.
