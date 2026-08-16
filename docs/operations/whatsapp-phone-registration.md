# WhatsApp Cloud API — registro do número

## Objetivo

Depois do WhatsApp Embedded Signup, o número selecionado precisa ser registrado na Cloud API antes de operar normalmente. O FlipForm faz esse passo pelo backend usando o `Phone Number ID` já vinculado ao tenant e a credencial técnica de System User da plataforma.

A referência oficial da Meta para esse fluxo é `POST /{Phone-Number-ID}/register`, com `messaging_product: "whatsapp"` e um PIN de 6 dígitos de verificação em duas etapas.

## Segurança

- O navegador envia somente o PIN de 6 dígitos.
- O navegador nunca informa WABA ID, Phone Number ID, token, App Secret ou System User ID para a chamada de registro.
- O backend carrega o binding ativo em `TenantWhatsAppConnection` usando o `tenantId` da sessão.
- O backend revalida o System User token e o WABA/número imediatamente antes do registro.
- O PIN não é salvo no banco, em audit log, metadata ou logs de aplicação.
- A credencial operacional usada é o System User Access Token global da plataforma com permissão de WhatsApp Business Messaging.
- O Admin System User token do onboarding não é carregado pelo fluxo de registro.

## Endpoint interno

`POST /api/integrations/whatsapp/registration`

Permissão: `INTEGRATIONS_EDIT`.

Body aceito:

```json
{
  "pin": "123456"
}
```

Nenhum outro campo é aceito.

O servidor resolve:

1. tenant e usuário pela sessão;
2. conexão WhatsApp ativa do tenant;
3. WABA ID e Phone Number ID pelo binding persistido;
4. System User token pela configuração global da plataforma;
5. validação das permissões do token;
6. validação de que o número ainda pertence ao WABA vinculado;
7. chamada oficial de registro na Meta.

## Registro operacional na UI

Após sucesso, o FlipForm grava somente o evento de auditoria `WHATSAPP_PHONE_REGISTERED`, sem PIN. O horário desse evento, quando posterior ao `connectedAt` atual do binding, é usado para mostrar que o número foi registrado.

O `connectedAt` é renovado quando o Embedded Signup é concluído novamente. Isso impede que um registro antigo de outro número do mesmo WABA seja exibido como válido para o binding atual.

Se a gravação do audit log falhar depois de a Meta já ter aceitado o registro, a resposta de registro continua sendo sucesso. Isso evita transformar uma falha local de auditoria em uma tentativa automática que poderia alterar novamente o estado de verificação em duas etapas.

## Janela pós Embedded Signup

A documentação oficial da Meta informa que números provenientes de Embedded Signup devem ser registrados dentro da janela definida pela plataforma após o onboarding. Na documentação oficial consultada para esta implementação, essa janela é de 14 dias. Se ela expirar, o Embedded Signup deve ser executado novamente antes do registro.

## Fora deste PR

- recuperação ou armazenamento do PIN;
- alteração automática do PIN;
- deregistro do número;
- rotação automática de credenciais;
- mudança de display name;
- qualquer alteração em Leads, Kanban, mensagens ou histórico de clientes.

## Production Data Safety

Este módulo não cria migration, não faz backfill e não executa `DELETE`, `TRUNCATE`, reset ou mass update. O único dado novo persistido é um audit log pontual depois de um registro solicitado explicitamente por usuário autorizado.
