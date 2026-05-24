# Data Safety Drill — FlipForm

## Objetivo
Validar periodicamente que backup e restore funcionam em ambiente controlado.

## Frequência sugerida
- Mensal antes do go-live
- Quinzenal nos primeiros meses
- Após mudanças grandes de schema
- Antes de auditoria

## Passo a passo do drill
1. Criar banco temporário vazio.
2. Gerar backup do ambiente de staging.
3. Restaurar no banco temporário.
4. Rodar `npx prisma validate`.
5. Rodar `npm run build`.
6. Rodar `npm run smoke:test`.
7. Verificar rotas críticas.
8. Registrar resultado.
9. Apagar banco temporário.
10. Armazenar relatório do drill.

## Critérios de sucesso
- Backup gerado.
- Restore concluído.
- Schema válido.
- Build passou.
- Smoke passou.
- Nenhum secret vazou.
- Nenhum dump foi commitado.

## Registro do drill
```txt
Data:
Responsável:
Origem do backup:
Destino do restore:
Resultado:
Erros:
Ações corretivas:
```
## Relacionado
- [Final Production Readiness](./final-production-readiness.md)
- [Audit Handoff](./audit-handoff.md)

