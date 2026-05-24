# Backup & Restore — FlipForm

## Objetivo
Documentar como gerar backup e restaurar o banco com segurança operacional.

## Pré-requisitos
- `pg_dump`
- `pg_restore`
- `psql`
- `DATABASE_URL` configurado localmente
- Acesso autorizado ao banco

> Nunca cole `DATABASE_URL` real em documentos, issues, PRs ou logs.

## Backup
Comando:

```bash
DATABASE_URL='postgresql://...' npm run db:backup
```

Comportamento do script:
- exige `DATABASE_URL`;
- não imprime `DATABASE_URL`;
- grava em `backups/flipform-backup-YYYYMMDD-HHMMSS.dump` por padrão;
- falha com código diferente de `0` se houver erro.

## Restore em ambiente controlado
Comando:

```bash
CONFIRM_RESTORE=true \
DATABASE_URL='postgresql://...' \
npm run db:restore -- backups/flipform-backup-YYYYMMDD-HHMMSS.dump
```

## Bloqueio de produção
O restore em produção é bloqueado por padrão.

Só use em emergência real e com dupla confirmação:

```bash
ALLOW_PRODUCTION_RESTORE=true
```

Além disso, `CONFIRM_RESTORE=true` é obrigatório.

## Smoke pós-restore
Após restaurar em ambiente controlado:

```bash
npx prisma generate
npx prisma validate
npm run typecheck
npm run build
npm run smoke:test
```

Com app local:

```bash
SMOKE_BASE_URL=http://localhost:3000 npm run smoke:test
```

Em staging:

```bash
SMOKE_BASE_URL=https://app.flipform.com.br npm run smoke:test
```

## O que não fazer
- Não commitar dumps.
- Não enviar backup por WhatsApp/e-mail sem criptografia.
- Não usar banco de produção para teste.
- Não imprimir `DATABASE_URL`.
- Não restaurar sobre produção sem aprovação.
- Não manter dump local além do necessário para o incidente/drill.

## Segurança de dados
- Backups contêm dados sensíveis.
- Backups devem ser criptografados em armazenamento externo.
- Acesso deve ser restrito por perfil.
- Retenção e descarte devem ser definidos pela operação.
## Relacionado
- [Final Production Readiness](./final-production-readiness.md)
- [Audit Handoff](./audit-handoff.md)

