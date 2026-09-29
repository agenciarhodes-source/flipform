# PR #316 — publicação controlada do Flip AI

## Escopo

Este incremento transforma o status já existente do atendente em um controle operacional real:

- mantém rascunhos e atendentes publicados visíveis no workspace;
- calcula prontidão no servidor e no tenant da sessão;
- exige destino válido, revisão atual indexada, OpenAI configurada e carteira disponível;
- publica ou retira o atendente do ar com concorrência otimista;
- registra as duas ações no `AuditLog`;
- diferencia o endereço reservado do link público ativo na interface.

Não cria schema, não ativa planos, não atribui tenants, não lança créditos, não cobra uso e não
altera Lead, Kanban, Meta, Google, WhatsApp, domínios ou credenciais.

## Guardas

- somente owner/admin com Premium ou Premium Pro ativo passa por `requireFlipAiAccess`;
- `tenantId` vem da sessão e nunca do payload;
- o payload aceita somente `publish|unpublish` e a versão esperada;
- a linha do tenant e a linha do agente são bloqueadas durante a transação;
- replay de uma ação já concluída é idempotente;
- versão concorrente produz conflito, sem sobrescrever configuração;
- o chat público continua resolvendo exclusivamente `status = published`;
- retirar do ar não exclui conversas, Leads, conhecimento ou histórico.

## Validação antes do merge

1. `npm run typecheck`;
2. `npm run prisma:validate` com `DATABASE_URL` de validação;
3. testes unitários do Flip AI;
4. testes estáticos de publicação e chat público;
5. build completo;
6. preview Vercel `READY`;
7. teste autenticado em tenant Premium de ensaio.

## Pós-merge

1. confirmar Production `READY`;
2. confirmar ausência de runtime errors;
3. manter Premium/Premium Pro globalmente inativos;
4. ativar somente o tenant piloto em operação separada e explicitamente autorizada;
5. criar agente piloto, indexar a base e revisar o checklist;
6. publicar somente depois do teste sem efeitos comerciais;
7. retirar do ar imediatamente se qualquer health check regredir.
