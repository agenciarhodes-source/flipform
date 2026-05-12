# FlipForm — Revisão técnica pré-deploy (staging)

Data: 2026-05-11
Escopo revisado: autenticação/autorização, APIs, Prisma schema, configuração de build, scripts e testes presentes no repositório.

## Críticos

1. **`JWT_SECRET` tem fallback inseguro hardcoded (`flipform-dev-secret`) em runtime**.
   - Impacto: em ambiente mal configurado, qualquer atacante que conheça o segredo padrão consegue forjar sessão JWT.
   - Evidência: `lib/auth.ts` e `middleware.ts` usam `process.env.JWT_SECRET || 'flipform-dev-secret'`.
   - Ação: falhar boot em produção/staging quando `JWT_SECRET` estiver ausente, sem fallback.

2. **Registro público (`/api/auth/register`) permite criação ilimitada de tenants sem rate limit / anti-abuso.**
   - Impacto: abuso de infraestrutura, spam tenancy, custo de banco/email, risco reputacional.
   - Evidência: `app/api/auth/register/route.ts` é endpoint aberto e não há proteção explícita anti-bot ou throttling.
   - Ação: rate limiting por IP + captcha opcional + feature flag para fechar auto-signup em staging/prod.

## Altos

1. **`withPermission` não revalida status do tenant (apenas role/permissão); bloqueio de tenant está centralizado em `withAuth`.**
   - Impacto: rotas que usam somente `withPermission` podem permitir acesso de tenants suspensos/bloqueados com JWT ainda válido.
   - Evidência: `lib/rbac-server.ts` não faz check de status, enquanto `lib/auth.ts` (`withAuth`) faz.
   - Ação: unificar guard (`withPermission` deve chamar `withAuth` internamente, ou replicar check de status).

2. **Sem estratégia explícita para rotação de JWT/chave (single secret, sem key id/versionamento).**
   - Impacto: rotação emergencial difícil sem derrubar todas as sessões; janela de risco maior após incidente.
   - Evidência: assinatura/verificação com único segredo em `lib/auth.ts`/`middleware.ts`.
   - Ação: introduzir `JWT_SECRET_CURRENT` + `JWT_SECRET_PREVIOUS` (ou JWKS interna).

3. **Índices potencialmente insuficientes para consultas multi-tenant em escala.**
   - Impacto: degradação de performance e custo (principalmente kanban/leads/reports).
   - Evidência: `Lead` só possui índices em `tenantId` e `stageId`; combinações comuns (`tenantId, pipelineId`, `tenantId, createdAt`, `tenantId, status`) não estão explícitas.
   - Ação: adicionar índices compostos orientados às queries reais.

## Médios

1. **Cookie de sessão sempre `secure: true` sem política explícita por ambiente.**
   - Impacto: em ambientes HTTP locais/staging específicos pode causar falhas de sessão difíceis de diagnosticar.
   - Evidência: `setSessionCookie` em `lib/auth.ts` fixa `secure: true`.
   - Ação: condicionar por ambiente/forwarded proto, mantendo `true` em produção.

2. **Sem `README.md` operacional no repositório para staging/prod.**
   - Impacto: risco operacional (env vars ausentes, setup inconsistente, deploy quebrado).
   - Evidência: arquivo não encontrado na raiz.
   - Ação: criar runbook mínimo (envs, migrations, seed, build, smoke tests).

3. **Scripts npm mínimos (sem lint/test/typecheck/prisma checks).**
   - Impacto: baixa qualidade de gate antes de merge/deploy.
   - Evidência: `package.json` só contém `dev/build/start`.
   - Ação: adicionar `typecheck`, `lint`, `test`, `prisma:validate`, `prisma:migrate:status`.

4. **Mistura de nomenclatura legado (`leadflow_token`) mantida em produção.**
   - Impacto: superfície extra desnecessária e possível confusão de sessão em migrações futuras.
   - Evidência: leitura/deleção de cookie legado em `lib/auth.ts`/`middleware.ts`.
   - Ação: definir janela de descontinuação e remover legado após migração.

## Baixos

1. **Nome do pacote não reflete produto (`nextjs-mongo-template`).**
   - Impacto: confusão operacional e de observabilidade.
   - Evidência: `package.json`.

2. **Dependência `mongodb` presente sem evidência de uso no stack Prisma/Postgres.**
   - Impacto: superfície de supply-chain e tamanho de build desnecessários.
   - Evidência: `package.json`.

3. **Ausência de suíte E2E Playwright detectável.**
   - Impacto: regressões de fluxo crítico (login, form público, RBAC) podem chegar ao staging.

## PRs pequenos sugeridos (ordem)

1. **PR-1 (Segurança obrigatória):** remover fallback de `JWT_SECRET`, validar env no bootstrap, documentar segredo obrigatório.
2. **PR-2 (Auth/RBAC):** unificar `withPermission` com check de tenant status.
3. **PR-3 (Proteção endpoints públicos):** rate limiting em `/api/auth/register` e `/api/public/forms/[slug]/submit`.
4. **PR-4 (DB performance):** novos índices compostos em `Lead`, `Task`, `Invite` e rotas de relatório; migration dedicada.
5. **PR-5 (Operação):** criar `README.md` de staging/prod + scripts npm de validação + checklist de deploy.
6. **PR-6 (Qualidade):** adicionar Playwright smoke (login, submit form público, acesso /admin, isolamento tenant).

## Arquivos prováveis para alterar

- `lib/auth.ts`
- `middleware.ts`
- `lib/rbac-server.ts`
- `app/api/auth/register/route.ts`
- `app/api/public/forms/[slug]/submit/route.ts`
- `prisma/schema.prisma`
- `prisma/migrations/*`
- `package.json`
- `README.md` (novo)
- `playwright.config.*` e `tests/e2e/*` (novos)

## Comandos de validação recomendados

```bash
# Qualidade geral
npm run typecheck
npm run lint
npm run test

# Prisma / banco
npx prisma validate
npx prisma format
npx prisma migrate status
npx prisma migrate dev --name add_multi_tenant_indexes

# Build
npm run build

# E2E
npx playwright test
```
