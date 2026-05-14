# FlipForm

SaaS multi-tenant para captura e gestão de leads com Next.js + TypeScript + Prisma + PostgreSQL (Neon).

## Stack
- Next.js 14 (App Router)
- TypeScript
- Prisma ORM
- PostgreSQL (Neon)
- JWT + cookie httpOnly
- RBAC + Super Admin

## Arquitetura
- `app/(app)`: área autenticada do tenant
- `app/admin`: área Super Admin
- `app/api`: APIs privadas, públicas e administrativas
- `lib/auth.ts` e `lib/jwt.ts`: sessão, assinatura/verificação JWT, rotação de segredo
- `prisma/schema.prisma`: modelo de dados multi-tenant

## Setup local
```bash
npm install
cp .env.example .env.local # ou crie .env.local manualmente
npx prisma generate
npx prisma migrate dev
npm run dev
```

## Variáveis de ambiente obrigatórias
- `DATABASE_URL`
- `DIRECT_URL` (obrigatória para migrations em staging/prod)
- `JWT_SECRET_CURRENT` (obrigatória)
- `JWT_SECRET_PREVIOUS` (opcional, janela de rotação)
- `NEXT_PUBLIC_BASE_URL`
- `RESEND_API_KEY` (obrigatória em staging/produção para envio real de OTP)
- `EMAIL_FROM` (obrigatória em staging/produção; domínio remetente validado)
- `COOKIE_SAMESITE` (opcional: `lax|strict|none`)
- `TRUST_PROXY_PROTO` (opcional: `https` quando necessário em proxy)

Compatibilidade legado:
- `JWT_SECRET` ainda é aceito como fallback para `JWT_SECRET_CURRENT`.

## Prisma
```bash
npx prisma validate
npx prisma generate
npx prisma migrate status
npx prisma migrate dev
npx prisma migrate deploy
npx prisma db seed
```

## Scripts npm
```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run prisma:validate
npm run prisma:migrate:status
npm run test
npm run test:e2e
npm run test:e2e:onboarding
npm run smoke
```

## E2E Onboarding (OTP)
- Preparação local:
  - `npm install`
- Instalar Playwright e browsers antes de rodar os testes:
  - `npm run playwright:install`
- Rodar localmente com ambiente de teste e provider mockado de e-mail.
- Executar suite de onboarding:
  - `npm run test:e2e:onboarding`
- Env recomendadas para E2E:
  - `NODE_ENV=test`
  - `JWT_SECRET_CURRENT`
  - `DATABASE_URL`/`DIRECT_URL` de banco isolado de teste
  - `RESEND_API_KEY` opcional (em teste pode usar mock)

## Deploy Vercel
1. Configurar envs de staging/production no painel.
2. Garantir `JWT_SECRET_CURRENT` distinto por ambiente.
3. Rodar migrations no banco-alvo.
4. Executar smoke após deploy.

## Staging checklist
- [ ] `JWT_SECRET_CURRENT` configurado
- [ ] `RESEND_API_KEY` configurada
- [ ] `EMAIL_FROM` configurado com domínio validado
- [ ] `DATABASE_URL` e `DIRECT_URL` corretas
- [ ] `NEXT_PUBLIC_BASE_URL` do staging
- [ ] `npx prisma validate && npx prisma generate`
- [ ] `npx prisma migrate status` sem pendências
- [ ] `npx prisma migrate deploy` aplicado
- [ ] `npm run smoke` ok
- [ ] fluxo login + form público + admin validado

## Billing / Asaas notes
- Módulos de `Subscription` e `Payment` já existem no schema para integração futura.
- Webhooks devem validar assinatura, idempotência e replay protection.

## Webhook notes (futuro)
- Verificar assinatura do provedor.
- Persistir `eventId` para idempotência.
- Processar com retry/backoff.
- Auditar payload bruto com redaction de dados sensíveis.

## Troubleshooting
- Sessão não persiste em localhost: usar `NODE_ENV=development` e revisar `COOKIE_SAMESITE`.
- 401 inesperado: validar secrets JWT e expiração do token.
- Lentidão em kanban/reports: validar índices e plano de execução SQL.
