# WhatsApp Embedded Signup — FlipForm

## Objetivo

O FlipForm usa um único Meta App da plataforma e mantém uma vinculação WhatsApp separada por tenant. A autorização de Ads/Pixel em `TenantMetaConnection` não é reutilizada para WhatsApp.

O authorization code/token devolvido pelo Embedded Signup é tratado somente como evidência temporária do onboarding. Ele não é persistido como credencial de runtime do tenant. A operação posterior usa System Users da plataforma, conforme o fluxo de Tech Provider da Meta.

## Configuração da plataforma

Em **Admin > Integrações da Plataforma > Meta** configure:

- Meta App ID
- Meta App Secret
- WhatsApp Embedded Signup — Configuration ID
- Business ID da plataforma
- System User ID do FlipForm
- Admin System User Access Token
- System User Access Token de runtime

Os dois access tokens ficam criptografados com `INTEGRATION_SECRET_KEY`, são mascarados no Admin e nunca são devolvidos a um tenant/browser.

A Configuration ID de WhatsApp é tratada separadamente da configuração de Facebook Login for Business usada por Ads.

Para disponibilizar Embedded Signup a clientes externos, o Meta App precisa estar preparado para o produto WhatsApp e para o App Review/Advanced Access exigido pela Meta.

## Fluxo por tenant

1. O tenant abre **Integrações** e clica em **Conectar WhatsApp**.
2. O backend gera state HMAC vinculado a tenant + usuário + finalidade `whatsapp_embedded_signup` + expiração.
3. O frontend abre o fluxo oficial da Meta via Facebook JavaScript SDK e a Configuration ID configurada no Admin.
4. O SDK retorna um authorization code e o evento `WA_EMBEDDED_SIGNUP` informa WABA e Phone Number ID.
5. O browser envia code + state + IDs para o backend.
6. O backend troca o code pelo token temporário de onboarding, verifica App ID, permissões/granular scopes e valida WABA -> número diretamente na Graph API.
7. O backend verifica se o WABA/número já pertence a outro tenant no FlipForm.
8. Usando o **Admin System User Access Token**, o backend garante que o System User da plataforma esteja atribuído ao WABA com permissão `MANAGE`.
9. O backend valida novamente WABA -> número usando o **System User Access Token de runtime**. Assim, o binding só é salvo se a credencial operacional da plataforma realmente conseguir operar o ativo selecionado.
10. Com o System User Access Token, o backend assina o app no WABA em `/{WABA-ID}/subscribed_apps`.
11. `tenant_whatsapp_connections` persiste somente o vínculo seguro do tenant com WABA/número e metadados não sensíveis; não persiste o token temporário do Embedded Signup.
12. O tenant recebe somente dados não sensíveis da conexão.

## Isolamento

- `waba_id` e `phone_number_id` não são aceitos como verdade apenas porque vieram do browser; ambos são revalidados na Meta.
- O token temporário de onboarding precisa pertencer ao Meta App do FlipForm.
- As permissões operacionais `whatsapp_business_management` e `whatsapp_business_messaging` são verificadas.
- Quando granular scopes informam WABAs autorizados, o WABA escolhido precisa estar entre os target IDs.
- O System User da plataforma precisa estar efetivamente atribuído ao WABA antes do binding.
- WABA e Phone Number ID têm unicidade global no banco para impedir que o mesmo ativo seja vinculado silenciosamente a tenants diferentes.
- Credenciais técnicas ficam globalmente na configuração da plataforma; o tenant armazena apenas o asset binding. Isso evita duplicar um token amplo em várias linhas de clientes.
- Tokens nunca são retornados por endpoint de tenant nem registrados em logs.
- Reautorização cria/atualiza apenas o binding daquele tenant e revoga bindings ativos anteriores do mesmo tenant; não altera leads, respostas ou histórico comercial.

## Registro do número

Este PR conclui o Embedded Signup, atribui o System User, valida os ativos e assina o WABA. O registro Cloud API do número (`/{Phone-Number-ID}/register`) fica separado porque exige o PIN de verificação em duas etapas.

O próximo módulo deve tratar o registro do número e a infraestrutura pública de Webhooks antes de habilitar envio/recebimento de mensagens no Inbox.

## Webhooks

A assinatura do WABA é feita neste fluxo para deixar o ativo preparado. O endpoint público de Webhooks, verificação do challenge, validação de assinatura, idempotência e roteamento por `phone_number_id` serão implementados no PR seguinte. Nenhum webhook externo deve confiar em `tenantId` enviado pelo remetente.

## Production data safety

A migration é aditiva: cria `tenant_whatsapp_connections` e adiciona colunas opcionais de configuração WhatsApp à configuração Meta da plataforma. Ela não executa `DELETE`, `TRUNCATE`, `DROP`, backfill ou atualização em massa de dados de clientes.
