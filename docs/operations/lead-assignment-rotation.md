# Rodízio automático de leads por formulário

O rodízio distribui leads de um formulário único entre usuários do tenant com perfil **Atendente/Vendedor (`agent`)** e status ativo. O formulário público não recebe `sellerId` nem link individual nesta versão.

## Quem configura

- **Dono da empresa (`owner`)** e **Administrador (`admin`)** podem configurar a distribuição no Form Builder.
- **Gestor (`manager`)**, **Atendente/Vendedor (`agent`)** e **Visualizador (`viewer`)** não editam o rodízio nesta versão.

## Como criar vendedores

O Super Admin cria o tenant e define o Dono da empresa. O Dono/Admin cria colaboradores no tenant e usa o papel **Atendente/Vendedor** para quem deve receber leads no rodízio.

## Como funciona a ordem

Na seção **Distribuição de leads** do formulário, selecione **Rodízio entre vendedores**, marque os vendedores ativos e ajuste a ordem. A cada submissão pública válida, o backend bloqueia a linha de rotação em transação (`SELECT ... FOR UPDATE`), escolhe o próximo vendedor pelo `currentIndex`, salva `lastAssignedTo` e avança o índice.

Exemplo com Maria, João e Carlos: lead 1 vai para Maria, lead 2 para João, lead 3 para Carlos e lead 4 volta para Maria.

## Dashboard e visibilidade

O Dashboard aceita o filtro `assignedTo=userId` para Dono/Admin/Gestor. Atendentes/Vendedores sempre ficam limitados ao próprio `userId`, mesmo que tentem enviar outro `assignedTo` na URL. A performance por vendedor aparece apenas para perfis com visão de equipe.

## Leads e Kanban

Leads têm o responsável exibido como `assignedUser`. Dono/Admin/Gestor podem alterar manualmente o responsável para um Atendente/Vendedor ativo do mesmo tenant. Atendentes/Vendedores veem apenas os próprios leads.

## Limitações atuais

- Apenas `agent` entra no rodízio; `manager` pode ser avaliado futuramente.
- Não há notificação automática ao vendedor nesta versão.
- Não há link individual por vendedor e não se usa `sellerId` no link público.
