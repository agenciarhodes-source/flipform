# FlipForm — Staging Deploy Checklist

## 1) Variáveis obrigatórias
- `DATABASE_URL` (Neon pool/primary)
- `DIRECT_URL` (conexão direta para migration)
- `JWT_SECRET_CURRENT`
- `JWT_SECRET_PREVIOUS` (opcional em rotação)
- `NEXT_PUBLIC_BASE_URL`
- `COOKIE_SAMESITE` (`lax` recomendado)

## 2) Neon setup
- Criar banco de staging isolado.
- Configurar usuário com permissões de migration.
- Definir `DATABASE_URL` e `DIRECT_URL` separadas de produção.
- Confirmar timezone e retenção de logs.

## 3) Vercel envs
- Project Settings > Environment Variables:
  - Preview/Staging: valores de staging
  - Production: valores de produção (não reutilizar)
- Revisar se nenhuma env sensível está em `NEXT_PUBLIC_*`.

## 4) JWT secrets
- Gerar `JWT_SECRET_CURRENT` com alta entropia.
- Se houver rotação ativa, manter `JWT_SECRET_PREVIOUS` por janela temporária.
- Após expiração da janela, remover `JWT_SECRET_PREVIOUS`.

## 5) Asaas sandbox vars (pré-integração)
- `ASAAS_API_KEY_SANDBOX`
- `ASAAS_WEBHOOK_TOKEN`
- `ASAAS_BASE_URL` (sandbox)
- Não habilitar processamento financeiro real em staging.

## 6) Prisma / Banco
```bash
npx prisma validate
npx prisma generate
npx prisma migrate status
npx prisma migrate deploy
```

## 7) Build e deploy
```bash
npm ci
npm run typecheck
npm run build
```

## 8) Smoke tests pós-deploy
- Login de tenant owner.
- Acesso dashboard/kanban/reports.
- Submissão de formulário público.
- Acesso `/admin` com platform admin.
- Verificar criação de lead + histórico + task.

## 9) Webhooks checklist
- Endpoint responde 2xx apenas para payload válido.
- Validar assinatura/token.
- Implementar idempotência por `eventId`.
- Logar falhas sem expor secret.

## 10) Rollback checklist
- Manter release anterior pronta para promote.
- Em falha grave:
  1. Reverter deploy no Vercel.
  2. Suspender rotinas de escrita críticas.
  3. Se migration incompatível, restaurar backup Neon.
  4. Validar autenticação e formulários após rollback.
