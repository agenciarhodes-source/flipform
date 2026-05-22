# Build and Deploy Health — FlipForm

## Objetivo
Padronizar a validação local antes de deploy para reduzir falhas de instalação, lockfile e build na Vercel.

## Comandos locais
Execute nesta ordem:

```bash
npm install
npx prisma generate
npm run typecheck
JWT_SECRET_CURRENT='staging-local-secret' npm run build
```

Se necessário para ambiente local sem integrações externas:

```bash
JWT_SECRET_CURRENT='staging-local-secret' \
NEXT_PUBLIC_MARKETING_URL='https://flipform.com.br' \
NEXT_PUBLIC_APP_URL='https://app.flipform.com.br' \
NEXT_PUBLIC_ADMIN_URL='https://admin.flipform.com.br' \
APP_HOSTNAME='app.flipform.com.br' \
ADMIN_HOSTNAME='admin.flipform.com.br' \
EMAIL_PROVIDER='none' \
EMAIL_FROM='atendimento@flipform.com.br' \
EMAIL_REPLY_TO='atendimento@flipform.com.br' \
npm run build
```

## Smoke
```bash
SMOKE_BASE_URL='https://app.flipform.com.br' npm run smoke:test
```

O smoke deve validar rotas críticas públicas sem chamar Asaas real, SMTP real ou Resend real.

## Dependências críticas
- `@radix-ui/react-switch` deve usar versão válida publicada no npm (ex.: `^1.2.5`).
- `nodemailer` deve estar em `dependencies` se o provider SMTP existir.
- `@types/nodemailer` deve estar em `devDependencies`.
- `package-lock.json` deve ser atualizado junto com `package.json`.

## Vercel
Projeto `flipform` usa:

```bash
npm install
npm run build
```

As envs de produção devem estar configuradas no painel da Vercel antes do deploy.
