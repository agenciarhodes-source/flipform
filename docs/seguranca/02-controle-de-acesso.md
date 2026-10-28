# 02 — Política de Controle de Acesso

> **Versão:** 1.0 · 28/10/2026 · **Dono:** Responsável pela Segurança · **Revisão:** anual

> **Para leigos:** controle de acesso responde a três perguntas: **quem é você?** (autenticação), **o que você pode fazer?** (autorização) e **o que você fez?** (registro). Este documento descreve como o FlipForm responde a cada uma.

## 1. Os dois "andares" de acesso

1. **Acesso ao produto** (app.flipform.com.br): usuários das empresas clientes e o Super Admin.
2. **Acesso à infraestrutura** (GitHub, Vercel, Neon, OpenAI, Meta, Google, Cloudflare R2): só a equipe técnica autorizada.

## 2. Quem é você? (autenticação)

| Medida | Como funciona |
|---|---|
| Senha | Guardada com **bcrypt** (um "embaralhamento" que não pode ser desfeito). Ninguém, nem a equipe, consegue ver a senha. |
| Limite de tentativas | Login, códigos e formulários públicos têm limite de tentativas, contado no banco (vale mesmo com vários servidores). |
| MFA (2 etapas) | Disponível para todos os usuários (Google Authenticator, padrão TOTP) com códigos de recuperação. **Obrigatório** para Super Admin e recomendado para Donos e Administradores. |
| Sessão | Cookie de 7 dias, mas **conferido no banco a cada acesso**: se a pessoa for removida da empresa, ou clicar em "Sair de todos os dispositivos", ou trocar a senha, o acesso cai na hora. |
| Perda do celular do MFA | O usuário usa um código de recuperação; sem ele, o Super Admin pode zerar o MFA (ação registrada na auditoria). |

> **Por que conferir no banco a cada acesso?** O cookie é como um crachá com validade de 7 dias. Se só olhássemos o crachá, alguém demitido entraria até ele vencer. Conferindo no banco, o crachá é "revalidado" toda vez.

## 3. O que você pode fazer? (autorização)

### 3.1 Perfis dentro de uma empresa

| Perfil | Resumo do que pode |
|---|---|
| **Dono** | Tudo da empresa, incluindo cobrança, exclusões e configurações. |
| **Administrador** | Gerir equipe, integrações (Meta, Google, WhatsApp), formulários, funis e IA. Não mexe em cobrança nem exclui. |
| **Gestor** | Ver e trabalhar todos os leads, relatórios da equipe, rodízio de leads. |
| **Atendente/Vendedor** | Só os leads atribuídos a ele. |
| **Visualizador** | Só consulta; não altera nada. |

Regras que o sistema garante (e que têm teste automático em `tests/security-t2-rbac.test.ts`):

- O Visualizador não tem nenhuma permissão de alteração.
- Só o Dono mexe em cobrança e exclui leads, formulários e funis.
- Equipe, integrações, domínios, auditoria e IA: só Dono e Administrador.
- Atendente só vê e mexe nos leads dele.
- Ninguém promove alguém a Dono; ninguém gerencia um perfil igual ou acima do seu.

### 3.2 Separação entre empresas

Cada registro pertence a uma empresa. Toda consulta inclui a empresa de quem está logado. Testes automáticos (`tests/test_security_t2_tenant_scope_static.py` e `tests/test_security_t2_route_guards_static.py`) bloqueiam qualquer código novo que:

- crie uma rota sem proteção conhecida;
- busque um registro só pelo número vindo da requisição, sem a empresa.

### 3.3 Super Admin da plataforma

Acesso que atravessa empresas, para suporte e operação. Regras:

1. Só pessoas aprovadas pelo Responsável pela Segurança.
2. **MFA obrigatório.**
3. Toda ação administrativa fica registrada (auditoria da plataforma).
4. Lista revisada a cada 3 meses (seção 6).

## 4. Acesso à infraestrutura

| Sistema | Para quê | Regra |
|---|---|---|
| GitHub | Código | MFA obrigatório; ramo `main` protegido (mudança só via PR com testes verdes) — ver pendências no arquivo 08 |
| Vercel | Hospedagem e segredos | MFA; só quem faz deploy |
| Neon | Banco de dados | MFA; mudanças de banco só com autorização explícita do responsável e somente "aditivas" (que não apagam dados) |
| OpenAI, Meta, Google, Stripe/Asaas, Cloudflare | Integrações | MFA; chaves só nas variáveis de ambiente |

## 5. Entrada, mudança e saída de pessoas

| Evento | O que fazer | Prazo |
|---|---|---|
| Entrada | Criar acesso com o menor perfil possível; ativar MFA | No primeiro dia |
| Mudança de função | Ajustar o perfil (subir ou descer) | No mesmo dia |
| Saída | Remover da empresa no FlipForm (o acesso cai na hora); remover de GitHub/Vercel/Neon/etc.; trocar segredos que a pessoa conhecia | **No mesmo dia** |

## 6. Revisão trimestral de acessos

A cada 3 meses, o Responsável pela Segurança confere e registra abaixo:

1. Quem é Super Admin (e se ainda precisa ser).
2. Quem tem acesso a GitHub, Vercel, Neon, OpenAI, Meta Business, Google, Cloudflare.
3. Se todos têm MFA ativo.

| Data | Quem revisou | Resultado / ajustes |
|---|---|---|
| [PREENCHER] | | |

## 7. O que você fez? (registro)

Ações importantes ficam na trilha de auditoria (tabela de auditoria do sistema): login, alterações de leads e configurações, exibição de CPF/CNPJ, ações do Super Admin, mudanças de perfil, reset de MFA. Esses registros não são editáveis pelas telas.
