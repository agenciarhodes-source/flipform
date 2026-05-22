# FlipForm — Backup & Restore Runbook

## Objetivo
Definir o procedimento operacional mínimo para backup e restore do banco PostgreSQL do FlipForm, reduzindo risco de perda de dados e acelerando resposta a incidentes.

## Escopo
- Backup lógico PostgreSQL via `pg_dump`.
- Restore controlado via `pg_restore`.
- Validação de backup e smoke test pós-restore.
- Procedimento para staging e produção (emergência).

## Riscos cobertos
- Erro humano em deploy/migração.
- Corrupção lógica de dados.
- Falha operacional em jobs/scripts.
- Necessidade de rollback para timestamp conhecido.

## Riscos não cobertos
- Desastre regional do provedor sem cópia externa.
- RPO zero (perda zero).
- Restore automático sem aprovação humana.
- Recuperação de infraestrutura fora do banco.

## Estratégia recomendada
### Backup
- Backup diário automático.
- Backup manual antes de migration.
- Backup manual antes de deploy crítico.

### Retenção
- Diário: 7 dias.
- Semanal: 4 semanas.
- Mensal: 3 meses.

### Restore testado
- Executar restore de teste mensal em staging.

## Variáveis de ambiente necessárias
- `DATABASE_URL` (origem para backup / destino para restore).
- `BACKUP_FILE` (arquivo `.dump` para restore, quando aplicável).
- `ALLOW_PROD_RESTORE=YES` (obrigatória para restore em produção).
- `CONFIRM_RESTORE=YES` (confirmação explícita de restore).

## Como gerar backup
1. Garantir acesso ao banco PostgreSQL via `DATABASE_URL`.
2. Executar:

```bash
DATABASE_URL="postgres://..." ./scripts/db-backup.sh
```

3. O arquivo será salvo em `./backups/flipform-YYYYmmdd-HHMMSS.dump`.

## Como validar backup
1. Verificar se o arquivo foi criado e possui tamanho > 0.
2. Validar integridade lógica mínima com:

```bash
pg_restore --list ./backups/flipform-YYYYmmdd-HHMMSS.dump >/dev/null
```

3. Registrar checksum (ex.: `sha256sum`) para trilha de auditoria operacional.

## Restore em staging
1. Confirmar janela de manutenção em staging.
2. Definir `DATABASE_URL` de staging e `BACKUP_FILE`.
3. Executar:

```bash
DATABASE_URL="postgres://..." BACKUP_FILE="./backups/flipform.dump" CONFIRM_RESTORE=YES ./scripts/db-restore.sh
```

4. Executar smoke test pós-restore (seção abaixo).

## Restore de produção em emergência
> **Obrigatório:** dupla aprovação manual (engenharia + responsável de operação).

1. Confirmar incidente e timestamp alvo.
2. Pausar deploys e jobs/cron.
3. Gerar snapshot atual antes do restore.
4. Validar backup alvo.
5. Repetir restore em staging (se ainda não executado para o mesmo arquivo).
6. Executar restore em produção com flags explícitas:

```bash
DATABASE_URL="postgres://..." BACKUP_FILE="./backups/flipform.dump" ALLOW_PROD_RESTORE=YES CONFIRM_RESTORE=YES ./scripts/db-restore.sh
```

## Checklist antes do restore
- [ ] Incidente confirmado.
- [ ] Timestamp de recuperação definido.
- [ ] Deploys pausados.
- [ ] Jobs/cron pausados.
- [ ] Snapshot do estado atual gerado.
- [ ] Backup alvo validado.
- [ ] Restore testado em staging.
- [ ] Aprovação manual registrada.

## Checklist depois do restore
- [ ] Validar login.
- [ ] Validar tenants.
- [ ] Validar forms.
- [ ] Validar leads.
- [ ] Validar billing.
- [ ] Validar admin.
- [ ] Validar webhooks.
- [ ] Validar migrations.
- [ ] Reativar jobs/cron.
- [ ] Registrar auditoria/incidente (timeline + evidências).

## Smoke test mínimo pós-restore (staging)
1. Login admin.
2. Abrir `/admin`.
3. Abrir `/admin/access`.
4. Abrir `/admin/billing`.
5. Abrir dashboard tenant.
6. Criar lead teste em staging.
7. Verificar audit log.
8. Verificar subscription/plan.

## Rollback
- Se restore gerar inconsistência, restaurar snapshot capturado imediatamente antes da operação.
- Repetir checklist pós-restore.
- Manter deploys pausados até validação final.

## Segurança
- Nunca commitar backups (`.dump`, `.sql`, `.backup`).
- Nunca expor `DATABASE_URL` em logs, tickets ou chat público.
- Criptografar backup quando armazenado fora do provedor.
- Restringir acesso a backups por princípio de menor privilégio.
- Sempre testar restore fora de produção antes de aplicar em produção.

## Contatos / Responsáveis
- **DRI Engenharia:** definir no on-call atual.
- **Aprovação Operacional:** responsável de operação/plataforma.
- **Escalonamento:** liderança técnica em incidentes Sev-1.
