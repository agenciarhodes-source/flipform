# Admin Access Management

## Fluxos
- Criar tenant de cortesia: `/admin/access` > Criar cortesia.
- Adicionar e-mail permitido: formulário “Adicionar e-mail”.
- Bloquear/desbloquear: ações na tabela de acessos.
- Login inválido: validar allowlist, tenant user e status do tenant.

## Demo
- Rodar `npm run demo:ensure-access` em ambiente controlado.
- Não use `prisma/seed.ts` para corrigir produção.

## Troubleshooting
- Credenciais inválidas
- Este e-mail não possui acesso autorizado
- Este e-mail está bloqueado
- Conta sem empresa associada
- Acesso bloqueado para esta empresa
