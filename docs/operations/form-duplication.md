# Duplicação de formulários

## Objetivo

A duplicação permite que Donos e Administradores criem uma cópia independente de um formulário existente para reaproveitar campos, identidade visual, origem automática e configuração de pipeline sem recriação manual.

## Dados copiados

A cópia preserva as configurações próprias do formulário: título público, descrição pública, cores, tema, logo, imagem de capa, mensagem de sucesso, regras de desqualificação, origem automática do lead, pipeline, etapa inicial e todos os campos com ordem, tipo, placeholder, descrição, opções, regras de validação e obrigatoriedade.

Quando existir rodízio de vendedores relacionado ao formulário, a configuração fixa é copiada com membros ativos válidos do mesmo tenant, mantendo a ordem cadastrada.

## Dados não copiados

A duplicação nunca copia ID, slug, link público pronto, leads, respostas, histórico, métricas, logs de tracking, logs de auditoria, registros financeiros, datas originais, eventos processados, cursor do rodízio, último vendedor escolhido ou qualquer dado gerado pelos clientes.

## Status inicial

Toda cópia é criada com `isActive: false`, mesmo quando o formulário original está ativo. Isso evita entrada de leads antes da revisão da cópia.

## Nome e slug

O nome é gerado dentro do tenant seguindo o padrão:

- `clientes` → `clientes (cópia)`;
- `clientes (cópia)` existente → `clientes (cópia 2)`;
- `clientes (cópia 2)` existente → `clientes (cópia 3)`.

O slug usa o mesmo padrão de slugificação do projeto, é único por tenant e recebe sufixos quando necessário, como `clientes-copia`, `clientes-copia-2` e `clientes-copia-3`. Colisões de unicidade do Prisma (`P2002`) são tratadas com novas tentativas e fallback aleatório limitado.

## Permissões

A API `POST /api/forms/[id]/duplicate` usa `FORMS_CREATE`:

- `owner`: pode duplicar;
- `admin`: pode duplicar;
- `manager`: não pode duplicar;
- `agent`: não pode duplicar;
- `viewer`: não pode duplicar.

O tenant vem exclusivamente da sessão. O endpoint não aceita `tenantId` pelo corpo e busca o formulário original com `tenantId` da sessão.

## Transação e validações

O formulário, campos e rodízio são criados dentro de uma transação. Se qualquer parte falhar, nada permanece parcialmente criado.

Antes da cópia, a API valida se o pipeline pertence ao tenant e se a etapa inicial pertence ao pipeline. Se pipeline ou etapa não existirem mais, a duplicação falha. Se algum deles estiver arquivado, a duplicação é permitida, mas continua inativa e retorna aviso.

## Audit log

Após a transação, é registrado `form.duplicated` com formulário original, novo formulário, novo slug, quantidade de campos copiados e confirmação de `isActive: false`. Se a transação falhar, não há audit log da duplicação.

## Teste manual

1. Criar ou usar um formulário chamado `clientes`, ativo, com origem `Meta Ads`, pipeline `Funil de Vendas`, etapa `Novo lead` e três campos.
2. Na tela de Formulários, clicar no ícone de duplicar.
3. Confirmar que `clientes (cópia)` aparece no início da lista como inativo, com a mesma origem, pipeline, etapa, três campos, zero leads e novo link público.
4. Abrir a edição da cópia e conferir campos, cores, origem, pipeline, etapa, mensagem de sucesso, slug diferente e status inativo.
5. Duplicar novamente e confirmar o nome `clientes (cópia 2)`.
6. Entrar como Atendente/Vendedor e confirmar que o botão não aparece e que POST direto retorna `403`.

## Banco de dados

Nenhuma migration ou execução SQL no Neon é necessária.
