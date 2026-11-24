# PR único — Acesso Desenvolvedor, RBAC e MFA

**Estado:** DRAFT. NÃO MESCLAR NEM PUBLICAR até implementação completa e validação.

## Objetivo
Desenvolvedor técnico por empresa, com mesmo login autorizado em várias empresas, seleção após senha e MFA obrigatório. Só a administração da plataforma pode conceder ou revogar esse vínculo. Nunca pedir senha do cliente.

## Permissões de produto
- Desenvolvedor: Integrações/API, Domínios, Automações, Configurar Suporte, configurações Flip AI, WhatsApp AI e Instagram AI, além das operações empresariais especificamente autorizadas.
- Dono: mantém CRM, finanças, relatórios, equipe e faturamento, mas perde todas as configurações técnicas acima.
- Admin/gestor: sem configurações técnicas. Acesso às operações comerciais conforme permissões existentes.
- Não confundir uso de IA ou atendimento humano com configuração técnica de IA. Manter Inbox humano ativo aos perfis autorizados.

## Auditoria do código atual
- Prisma enum Role só possui owner/admin/manager/agent/viewer.
- globalRole=platform_admin é superadministrador global, não equivale à concessão developer por cliente.
- lib/rbac.ts libera INTEGRATIONS e DOMAINS para owner/admin, FLIP_AI_MANAGE para owner/admin.
- Configuração Suporte atualmente exige owner.
- O login já implementa escolha de tenant após senha e cruza AllowedUser e TenantUser; reutilizar essa base.
- MFA TOTP e recovery já existem, mas precisam ser obrigatórios para developer.
- API v1 possui gate próprio owner-only (mayManageApiV1Credentials / canManageApiV1Keys) que precisa ser alterado cuidadosamente.
- Existem rotas fora de withPermission: esconder menus não equivale a proteção no servidor.

## Entrega obrigatória no MESMO PR antes de retirar draft
1. Grant developer por usuário e tenant, com migração aditiva, índice único, status, aprovador, datas e auditoria. NÃO conceder acesso universal pelo e-mail.
2. Provisionamento e revogação exclusivamente por plataforma com MFA e proteção CSRF; revogação invalida sessão imediatamente.
3. Login reutiliza seleção de empresa com vínculo ativo e restrições de empresa; developer precisa de TOTP confirmado antes da emissão de sessão técnica.
4. Verificação em servidor sem confiar em role/tenant enviados pelo browser; gate MFA ligado à sessão atual e verificação da concessão a cada operação crítica, sem cache que prolongue revogação.
5. Inventário e bloqueio de rotas GET/POST/PATCH/DELETE dos módulos técnicos, callback OAuth, webhooks de configuração, rotas de API keys e endpoints auxiliares.
6. Mudança de RBAC em UI e servidor. Áreas técnicas invisíveis a owners/admins/managers e com 403 no acesso direto.
7. Configuração IA separada das consultas/atendimento operacional; não bloquear atividades comerciais legítimas.
8. Seletor de empresas autorizadas, indicação da empresa atual, eventos auditados de troca de contexto, saída segura.
9. Regras comerciais de owner preservadas para usuários, billing, CRM, relatórios e equipe. Não alterar dados existentes.
10. Testes multiempresa A/B, grants revogados, MFA obrigatório, token falso, sessão obsoleta, grupos empresariais, owner/admin/manager, bypass por endpoint e regressões.
11. Ensaiar migração, rollback/flags e recuperação em staging; provisionar técnico antes de remover definitivamente permissões dos demais.
12. CI, typecheck, build, auditoria de segurança e homologação E2E exigidos antes do merge. Não ativar produção automaticamente.

## Status
Este DRAFT contém somente a política pura e testes básicos de autorização. Não altera permissões de produção, login, banco de dados, menu nem endpoints. É deliberadamente NÃO PRONTO para merge. Todo restante permanece no mesmo PR.