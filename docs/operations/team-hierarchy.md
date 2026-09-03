# Hierarquia da equipe e visão operacional

## Objetivo

Permitir que Dono da empresa, Administrador e Gestor acompanhem os níveis subordinados sem trocar de login e sem impersonar outro usuário.

A identidade da sessão não muda. A pessoa que está autenticada continua sendo a autora das ações e dos registros de auditoria.

## Hierarquia

A relação é muitos-para-muitos e tenant-scoped:

- Dono da empresa → Administradores/Gestores/Atendentes;
- Administrador → Gestores/Atendentes;
- Gestor → Atendentes;
- um subordinado pode possuir mais de um superior quando a operação exigir supervisão compartilhada.

Os vínculos ficam exclusivamente em `tenant_user_hierarchy`. Nenhum campo de Lead, Form, Pipeline, Inbox, Conversation, WhatsApp ou integração é reutilizado para guardar hierarquia.

## Escopo

O backend sempre parte de `session.tenantId` e `session.userId`.

- Dono: visão de toda a empresa;
- Administrador/Gestor com hierarquia configurada: usuário atual + descendentes;
- Atendente: somente a própria operação;
- seleção de outra visão só é aceita quando o alvo pertence ao conjunto autorizado do usuário logado.

O navegador envia apenas `scopeTenantUserId`. O tenant nunca vem do browser como fonte de autoridade.

## Compatibilidade

A atualização é fail-safe:

1. se a tabela ainda não existir, a leitura entra em modo legado;
2. se a tabela existir mas o tenant ainda não tiver nenhum vínculo, o comportamento legado é preservado;
3. ao cadastrar o primeiro vínculo, Administradores/Gestores passam a usar o escopo hierárquico;
4. o Dono mantém visão total.

Assim, deploy e reparo de schema podem ocorrer separadamente sem remover acesso dos clientes existentes.

## Schema

O SQL é apenas aditivo:

`prisma/migrations/20260903003000_add_tenant_user_hierarchy/migration.sql`

Aplicação em produção deve ser explícita pelo workflow manual:

`Repair Team Hierarchy Schema`

Esse workflow usa `prisma db execute` somente para o SQL acima. **Não executar `prisma migrate deploy`** para esta atualização.

## Fora do escopo / preservado

Esta atualização não altera:

- leads existentes ou `assignedTo`;
- formulários;
- pipelines;
- Meta Ads;
- Pixel/Dataset/CAPI;
- Google Ads/GTM;
- tokens ou credenciais;
- TenantIntegrationSettings;
- WABA/WhatsApp Cloud API;
- Inbox, Conversation ou Message;
- automações existentes;
- domínios personalizados.

A visão consolidada somente lê leads, compras e responsáveis já existentes.

## Rollout recomendado

1. merge manual após CI/Preview;
2. confirmar Vercel Production READY;
3. executar manualmente `Repair Team Hierarchy Schema`;
4. abrir **Visão da equipe** como Dono/Admin;
5. cadastrar primeiro uma estrutura controlada (ex.: Gestor Imperatriz → Atendentes Imperatriz);
6. validar a visão do Gestor;
7. cadastrar os demais vínculos;
8. comparar os totais da visão consolidada com a operação esperada.

O primeiro vínculo ativa o escopo hierárquico para Administradores/Gestores daquele tenant, portanto a estrutura deve ser cadastrada de forma consciente.
