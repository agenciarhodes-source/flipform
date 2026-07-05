# RBAC e permissões do FlipForm

Este documento consolida a hierarquia de acessos do FlipForm sem alterar os valores internos do enum `Role`.

## Super Admin da plataforma

O **Super Admin** é identificado por `globalRole = platform_admin`. Ele não é um cargo comum dentro de uma empresa cliente. Esse acesso pode operar a área global `/admin`, criar tenants/clientes, diagnosticar billing, gerenciar clientes, bloquear/desbloquear tenants e criar ou definir o usuário inicial como **Dono da empresa**.

Regra crítica: somente o **Super Admin** pode criar ou definir um usuário como `owner` de uma empresa.

## Papéis da empresa e labels em português

| Valor interno | Label na interface | Descrição |
| --- | --- | --- |
| `owner` | Dono da empresa | Acesso total à empresa, usuários, relatórios, financeiro e configurações. |
| `admin` | Administrador | Administra a operação da empresa, com acesso amplo, exceto ações críticas de propriedade. |
| `manager` | Gestor | Gerencia a equipe comercial e acompanha performance, leads e tarefas. |
| `agent` | Atendente/Vendedor | Atende e movimenta apenas os próprios leads atribuídos. |
| `viewer` | Visualizador | Acesso somente leitura, sem permissão para alterar dados. |

## Hierarquia

| Papel | Nível |
| --- | ---: |
| Visualizador | 10 |
| Atendente/Vendedor | 20 |
| Gestor | 30 |
| Administrador | 40 |
| Dono da empresa | 50 |

O **Super Admin** fica fora dessa hierarquia porque usa `globalRole = platform_admin`.

## Matriz de permissões resumida

- **Dashboard**: Dono, Administrador e Gestor veem visão geral; Atendente/Vendedor vê visão individual; Visualizador vê somente leitura.
- **Leads/Kanban**: Dono, Administrador, Gestor e Visualizador veem todos. Atendente/Vendedor vê somente leads com `assignedTo` igual ao seu `userId`.
- **Edição e movimentação de leads**: Dono, Administrador e Gestor editam/movem todos. Atendente/Vendedor edita/move apenas próprios leads. Visualizador não edita nem move.
- **Compras/Financeiro comercial**: Dono, Administrador e Gestor veem e registram compras. Atendente/Vendedor opera apenas compras dos próprios leads. Visualizador tem leitura quando liberado.
- **Usuários e convites**: Dono e Administrador acessam gestão de usuários, respeitando a hierarquia de cargos.
- **Domínios e integrações**: Dono e Administrador apenas.
- **Relatórios**: Dono, Administrador, Gestor e Visualizador veem relatórios; Atendente/Vendedor vê relatório individual. Exportação é restrita a Dono e Administrador.
- **Billing/plano**: Dono dentro do tenant; Super Admin na área global.

## Regras de criação e alteração de cargos

- Super Admin pode criar/definir `owner`.
- Dono da empresa pode criar/editar Administrador, Gestor, Atendente/Vendedor e Visualizador.
- Dono da empresa não pode criar outro Dono da empresa.
- Administrador pode criar/editar Gestor, Atendente/Vendedor e Visualizador.
- Administrador não pode criar outro Administrador nem Dono da empresa.
- Gestor, Atendente/Vendedor e Visualizador não gerenciam usuários.

Tentativas de definir `owner` fora do Super Admin devem retornar 403 com mensagem amigável.

## Regra de escopo do Atendente/Vendedor

Toda consulta ou API operacional de Atendente/Vendedor deve aplicar escopo individual:

```ts
assignedTo: session.userId
```

Esse escopo vale para Dashboard, Leads, Kanban, Tarefas, Compras, Relatórios, Performance, Busca e APIs de edição. Leads sem responsável não aparecem para Atendente/Vendedor até que uma regra futura de fila pública seja criada.

## Regra do Visualizador

Visualizador pode acessar telas e dados em modo leitura conforme liberado, mas não pode criar, editar, mover, excluir, registrar compras, convidar usuários, alterar permissões, configurar integrações/domínios nem exportar dados gerais.

## Como testar

1. Autenticar como Dono, Administrador, Gestor, Atendente/Vendedor e Visualizador.
2. Validar que os cargos aparecem em português em usuários, convites, edição de usuário e badges.
3. Confirmar que Atendente/Vendedor não lista, busca, abre, edita ou move lead de outro usuário.
4. Confirmar que parâmetros como `assignedTo` não permitem bypass para Atendente/Vendedor em Dashboard/Relatórios.
5. Confirmar que Visualizador recebe 403 ao editar lead ou mover Kanban.
6. Confirmar que Dono pode convidar Administrador, Gestor, Atendente/Vendedor e Visualizador, mas não Dono.
7. Confirmar que Administrador pode convidar Gestor, Atendente/Vendedor e Visualizador, mas não Administrador nem Dono.
8. Confirmar que Super Admin consegue definir Dono da empresa nos fluxos globais da plataforma.
9. Executar `npx prisma generate`, `npm run typecheck`, `JWT_SECRET_CURRENT='staging-local-secret' npm run build` e a suíte de testes aplicável.
