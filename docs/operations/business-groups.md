# Grupos empresariais e visão multiempresa

## Objetivo

Permitir que um responsável acompanhe múltiplos tenants independentes com um único login, sem fundir bancos, mover leads ou alterar integrações existentes.

Exemplo Belo Norte:

- Grupo empresarial: **Belo Norte**
- Tenants vinculados:
  - Belo Norte Parnaíba
  - Belo Norte Imperatriz
  - Belo Norte São Luís
- Responsável do grupo: `gestorsbn@gmail.com`

## Princípios de segurança

- `Tenant` continua sendo a fronteira dos dados operacionais.
- Leads, formulários, pipelines, Inbox, WhatsApp, Meta, Google Ads, GTM, domínios, tokens e credenciais não são migrados nem regravados.
- Grupo empresarial é uma camada de autorização adicional acima dos tenants.
- O navegador nunca define sozinho o tenant autorizado: o backend valida `userId + groupId + tenantId`.
- A troca de unidade mantém a identidade real do usuário; não existe impersonação de gestor ou atendente.
- Antes de trocar a sessão, o backend também valida a situação de acesso/billing do tenant.

## Estrutura de dados

Tabelas aditivas:

- `business_groups`
- `business_group_tenants`
- `business_group_users`

Nenhuma tabela operacional existente é alterada pela criação do grupo.

## Papéis no grupo

- `owner` → abre tenants com papel de Dono da empresa.
- `admin` → abre tenants com papel de Administrador.
- `viewer` → abre tenants como Visualizador.

Os papéis de grupo não alteram os `TenantUser` já existentes das lojas.

## Rollout seguro

1. Fazer merge manual após CI/Preview verde.
2. Confirmar Vercel Production `READY`.
3. Executar manualmente GitHub Actions → **Repair Business Group Schema**.
4. No Super Admin, abrir **Grupos empresariais**.
5. Criar o grupo `Belo Norte`.
6. Vincular somente os tenants de Parnaíba, Imperatriz e São Luís.
7. Adicionar `gestorsbn@gmail.com` como `owner` ou `admin` do grupo.
8. Fazer login com o usuário e validar **Visão do grupo**.
9. Testar cada botão **Abrir** e confirmar que Dashboard/Kanban/Leads mostram apenas a unidade escolhida.
10. Somente após validação completa decidir se o tenant interno antigo do usuário deve permanecer ativo.

## Tenant interno do responsável

O login tradicional do FlipForm ainda exige ao menos um `TenantUser` + `AllowedUser` ativo para estabelecer a sessão inicial. Portanto, nesta primeira versão, **não desative** o tenant `Acesso interno gestorsbn@gmail.com` antes dos testes.

Esse tenant serve apenas como ponto de entrada da sessão. Após o login, usuários com grupo empresarial são enviados diretamente para `/group` e podem abrir qualquer tenant autorizado do grupo.

## Banco / migrations

Não executar `prisma migrate deploy` em produção.

A instalação é feita somente pelo workflow manual **Repair Business Group Schema**, que executa o SQL aditivo específico com `prisma db execute`.
