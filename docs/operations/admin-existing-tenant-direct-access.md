# Super Admin — acesso direto em empresa existente

## Objetivo

Permitir que o Super Admin crie um usuário diretamente dentro de um tenant já existente, sem convite por e-mail e sem criar uma nova empresa por engano.

## Fluxo seguro

1. Abrir **Acessos diretos** no Super Admin.
2. Manter **Vincular a empresa existente** selecionado.
3. Selecionar explicitamente a empresa/tenant.
4. Informar e-mail e senha inicial.
5. Escolher o papel (`owner`, `admin`, `manager`, `agent` ou `viewer`).
6. Criar o acesso.

O frontend envia o `tenantId` selecionado para a API existente. O serviço `createManualAccess` reutiliza esse tenant e faz `upsert` de `TenantUser`/`AllowedUser` para o e-mail informado.

## Proteções

- **Empresa existente** é o modo padrão.
- O botão fica desabilitado enquanto nenhum tenant for selecionado nesse modo.
- **Criar nova empresa** exige escolha explícita do Super Admin.
- A interface informa claramente quando a ação criará um novo tenant.
- Nenhuma migration é necessária.
- Não há alteração em leads, formulários, pipelines, tracking, Meta, Google Ads/GTM, WhatsApp, Inbox, tokens, credenciais ou integrações.
