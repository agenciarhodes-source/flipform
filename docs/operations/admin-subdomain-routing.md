# FlipForm — Admin Subdomain Routing

## Objetivo
Permitir acesso ao painel administrativo por subdomínio dedicado (ex.: `admin.flipform.com.br`) sem quebrar o acesso atual por `/admin` no domínio principal.

## Variáveis de ambiente
- `ADMIN_HOSTNAME` (ex.: `admin.flipform.com.br`)
- `APP_HOSTNAME` (opcional, documentação operacional; ex.: `app.flipform.com.br`)

> Se `ADMIN_HOSTNAME` não estiver definido, o comportamento permanece como hoje.

## Como funciona
- O middleware detecta `Host` da requisição.
- Se o host for igual a `ADMIN_HOSTNAME`, caminhos não administrativos são reescritos para `/admin`.
  - `/` → `/admin`
  - `/access` → `/admin/access`
  - `/billing` → `/admin/billing`
- Exceções (não reescrever):
  - `/admin*`
  - `/api*`
  - `/_next*`
  - `/favicon.ico`

## RBAC e segurança
- RBAC existente permanece inalterado.
- Rotas `/api/admin/*` continuam protegidas por `withPlatformAdmin`.
- Usuário tenant sem perfil de platform admin segue bloqueado/redirecionado conforme padrão atual.

## Configuração DNS e Vercel
1. Criar entrada DNS para subdomínio admin.
   - Exemplo comum em Vercel: `CNAME admin -> cname.vercel-dns.com`.
2. Adicionar domínio/subdomínio no projeto da Vercel.
3. Configurar variáveis de ambiente:
   - `ADMIN_HOSTNAME=admin.flipform.com.br`
   - `APP_HOSTNAME=app.flipform.com.br`
4. Fazer redeploy.

## Testes pós-configuração
- Domínio atual:
  - `/admin`
  - `/admin/access`
  - `/admin/billing`
- Subdomínio admin:
  - `https://admin.../` abre painel admin
  - `https://admin.../access` abre `/admin/access`
  - `https://admin.../billing` abre `/admin/billing`
- Verificar:
  - usuário não admin bloqueado
  - `/_next/*` carrega normalmente
  - `/api/admin/*` responde normalmente (com RBAC)

## Rollback
- Remover `ADMIN_HOSTNAME` do ambiente e redeploy.
- O roteamento volta ao comportamento anterior baseado em `/admin` no domínio atual.
