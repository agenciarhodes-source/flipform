# WhatsApp Embedded Signup — FlipForm

## Objetivo

O FlipForm usa um único Meta App da plataforma e mantém uma conexão WhatsApp separada por tenant. Credenciais de WhatsApp nunca são reutilizadas do `TenantMetaConnection` de Ads/Pixel.

## Configuração da plataforma

Em **Admin > Integrações da Plataforma > Meta** configure:

- Meta App ID
- Meta App Secret
- WhatsApp Embedded Signup — Configuration ID

A Configuration ID de WhatsApp é tratada separadamente da configuração de Facebook Login for Business usada por Ads.

Para disponibilizar Embedded Signup a clientes externos, o Meta App precisa estar preparado para o produto WhatsApp e para o App Review/Advanced Access exigido pela Meta, incluindo as permissões necessárias ao onboarding e à gestão de WABAs.

## Fluxo por tenant

1. O tenant abre **Integrações** e clica em **Conectar WhatsApp**.
2. O backend gera state HMAC vinculado a tenant + usuário + finalidade `whatsapp_embedded_signup` + expiração.
3. O frontend abre o fluxo oficial da Meta via Facebook JavaScript SDK e a Configuration ID configurada no Admin.
4. O SDK retorna um authorization code e o evento `WA_EMBEDDED_SIGNUP` informa WABA e Phone Number ID.
5. O browser envia code + state + IDs para o backend.
6. O backend troca o code por access token, inspeciona o token, valida permissões e valida WABA -> número diretamente na Graph API.
7. O backend assina o app no WABA em `/{WABA-ID}/subscribed_apps`.
8. O token é criptografado com `INTEGRATION_SECRET_KEY` e persistido em `tenant_whatsapp_connections`.
9. O tenant recebe somente dados não sensíveis da conexão.

## Isolamento

- `waba_id` e `phone_number_id` não são aceitos como verdade apenas porque vieram do browser; ambos são revalidados na Meta.
- O token deve pertencer ao Meta App do FlipForm.
- As permissões `whatsapp_business_management` e `whatsapp_business_messaging` são exigidas pela conclusão do onboarding.
- Quando granular scopes informam WABAs autorizados, o WABA escolhido precisa estar entre os target IDs.
- WABA e Phone Number ID têm unicidade global no banco para impedir que o mesmo ativo seja vinculado silenciosamente a tenants diferentes.
- Tokens nunca são retornados pelo endpoint de status nem registrados em logs.
- Reautorização cria/atualiza apenas a conexão daquele tenant e revoga conexões ativas anteriores do mesmo tenant; não altera leads, respostas ou histórico comercial.

## Registro do número

Este PR conclui o Embedded Signup, valida os ativos e assina o WABA. O registro Cloud API do número (`/{Phone-Number-ID}/register`) fica separado porque exige o PIN de verificação em duas etapas. A Meta determina que números vindos de Embedded Signup sejam registrados dentro da janela aplicável ao onboarding.

O próximo módulo deve tratar o registro do número e a infraestrutura pública de Webhooks antes de habilitar envio/recebimento de mensagens no Inbox.

## Webhooks

A assinatura do WABA é feita neste fluxo para deixar o ativo preparado. O endpoint público de Webhooks, verificação do challenge, validação de assinatura, idempotência e roteamento por `phone_number_id` serão implementados no PR seguinte. Nenhum webhook externo deve confiar em `tenantId` enviado pelo remetente.

## Production data safety

A migration é aditiva: cria `tenant_whatsapp_connections` e adiciona uma coluna de configuração global. Ela não executa `DELETE`, `TRUNCATE`, `DROP`, backfill ou atualização em massa de dados de clientes.
