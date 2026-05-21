# FlipForm App — Produção: Domínios, DNS e Variáveis de Ambiente

## Arquitetura final
- `flipform.com.br` → landing pública (projeto **flipform-landing**)
- `www.flipform.com.br` → redirect 307/308 para `flipform.com.br` (projeto **flipform-landing**)
- `app.flipform.com.br` → SaaS/app (projeto **flipform**)
- `admin.flipform.com.br` → painel admin interno (projeto **flipform**)

> Este repositório é apenas app/SaaS/admin. Não deve servir landing pública.

## Cloudflare DNS esperado (DNS only)
- `A` `flipform.com.br` → `76.76.21.21`
- `CNAME` `www` → `68a48dcea7693d22.vercel-dns-017.com`
- `CNAME` `app` → `cname.vercel-dns.com`
- `CNAME` `admin` → `cname.vercel-dns.com`

Todos os registros acima devem ficar como **DNS only** (sem proxy laranja inicialmente).

## Vercel — projeto landing
Projeto: `flipform-landing`
- Domínios:
  - `flipform.com.br` (Production)
  - `www.flipform.com.br` (redirect para `flipform.com.br`)

## Vercel — projeto app
Projeto: `flipform`
- Domínios:
  - `app.flipform.com.br`
  - `admin.flipform.com.br`

Não adicionar `flipform.com.br` nem `www.flipform.com.br` neste projeto.

## Variáveis de ambiente esperadas no projeto Vercel `flipform`
Públicas:
- `NEXT_PUBLIC_MARKETING_URL=https://flipform.com.br`
- `NEXT_PUBLIC_APP_URL=https://app.flipform.com.br`
- `NEXT_PUBLIC_ADMIN_URL=https://admin.flipform.com.br`

Hosts/App:
- `APP_HOSTNAME=app.flipform.com.br`
- `ADMIN_HOSTNAME=admin.flipform.com.br`

E-mail transacional:
- `EMAIL_FROM=atendimento@flipform.com.br`
- `EMAIL_REPLY_TO=atendimento@flipform.com.br`

Segredos (definir sem expor valores reais):
- `DATABASE_URL=`
- `JWT_SECRET_CURRENT=`
- `JWT_SECRET_PREVIOUS=`
- `ASAAS_API_KEY=`
- `ASAAS_WEBHOOK_TOKEN=`
- `ASAAS_BASE_URL=`
- `CRON_SECRET=`
- `INTERNAL_JOB_SECRET=`
- `SENTRY_DSN=`

## Root redirect do app
A rota raiz deste app deve continuar redirecionando `/` para `/login`.

## Host routing (app/admin)
Com `ADMIN_HOSTNAME=admin.flipform.com.br`:
- requests em `admin.flipform.com.br` reescrevem para `/admin/*`
- `/api/*`, `/_next/*`, `/favicon.ico` não sofrem rewrite
- evita loop (`/admin/admin`) porque paths já iniciados em `/admin` são ignorados
- `localhost` e preview Vercel continuam funcionando; rewrite só ocorre quando host bate com `ADMIN_HOSTNAME`

## URLs de smoke pós-configuração
- https://flipform.com.br
- https://www.flipform.com.br
- https://app.flipform.com.br/login
- https://app.flipform.com.br/checkout/starter
- https://app.flipform.com.br/checkout/growth
- https://app.flipform.com.br/checkout/pro
- https://admin.flipform.com.br

## Primeiro acesso seguro
Remetente de suporte/transacional: `atendimento@flipform.com.br`.

Após confirmação de pagamento:
- cliente recebe e-mail de ativação;
- assunto: **SEU PLANO JÁ ESTÁ ATIVO NA FLIPFORM**;
- e-mail contém link seguro de primeiro acesso;
- não enviar senha padrão por e-mail.

**Não enviar senha padrão por e-mail. Usar link seguro de primeiro acesso.**
