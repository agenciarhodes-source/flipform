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

Os vínculos ficam exclusivamente em `tenant_user_hierarchy`. O estado de ativação fica em `tenant_team_hierarchy_settings`. Nenhum campo de Lead, Form, Pipeline, Inbox, Conversation, WhatsApp ou integração é reutilizado para guardar hierarquia.

## Escopo

O backend sempre parte de `session.tenantId` e `session.userId`.

Com a hierarquia ativa:

- Dono: visão de toda a empresa;
- Administrador/Gestor: usuário atual + descendentes;
- Atendente: somente a própria operação;
- seleção de outra visão só é aceita quando o alvo pertence ao conjunto autorizado do usuário logado.

O navegador envia apenas `scopeTenantUserId`. O tenant nunca vem do browser como fonte de autoridade.

## Compatibilidade e ativação segura

A atualização é fail-safe e draft-first:

1. se as tabelas ainda não existirem, a leitura entra em modo legado;
2. depois do reparo, a hierarquia nasce **desativada** por padrão;
3. Dono/Administrador pode montar todos os vínculos sem mudar a visão atual de ninguém;
4. ativar exige que Gestores e Atendentes ativos tenham ao menos um superior cadastrado;
5. somente após a ativação Administradores/Gestores passam a usar o escopo hierárquico;
6. o Dono mantém visão total;
7. a hierarquia pode ser desativada para restaurar imediatamente a visão ampla legada, sem apagar vínculos.

Assim, deploy, reparo de schema, configuração e ativação podem ocorrer separadamente sem remover acesso durante a montagem da árvore.

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
5. montar toda a estrutura em modo rascunho (ex.: Administrador → Gestores → Atendentes);
6. conferir na tabela se Gestores/Atendentes possuem superior;
7. clicar **Ativar hierarquia**;
8. validar a visão de cada Gestor/Administrador;
9. comparar os totais da visão consolidada com a operação esperada.

Nenhum vínculo isolado altera o escopo enquanto a hierarquia estiver desativada.
