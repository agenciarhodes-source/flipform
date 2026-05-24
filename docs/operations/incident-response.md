# Incident Response — FlipForm

## Playbooks

### Cliente pagou e não recebeu acesso
- **Sintoma:** pagamento confirmado sem ativação.
- **Risco:** churn e suporte crítico.
- **Ação imediata:** checar `/api/admin/billing/diagnostics` e último webhook.
- **Quem acionar:** engenharia + operação.
- **Como conter:** reconcile manual e validação de acesso do tenant.
- **Como recuperar:** reprocessar fluxo de ativação e comunicação ao cliente.
- **Como validar:** login, billing status e onboarding funcionando.
- **Como documentar:** incidente + timeline + causa raiz.

### Webhook Asaas falhou
- **Sintoma:** eventos não processados/atrasados.
- **Risco:** status financeiro inconsistente.
- **Ação imediata:** validar token/config/env e logs.
- **Quem acionar:** engenharia backend.
- **Como conter:** execução de reconciliação manual.
- **Como recuperar:** corrigir integração e reprocessar eventos relevantes.
- **Como validar:** tenant alvo refletindo status correto.
- **Como documentar:** evidências + ação preventiva.

### E-mail transacional falhou
- **Sintoma:** não envio de e-mails críticos.
- **Risco:** cliente sem acesso.
- **Ação imediata:** revisar provider (`none|smtp|resend`) e configuração.
- **Quem acionar:** engenharia + operação.
- **Como conter:** reenvio controlado após correção.
- **Como recuperar:** corrigir credenciais/configuração do provedor.
- **Como validar:** envio de teste controlado e auditoria.
- **Como documentar:** causa e impacto.

### Checkout com erro
- **Sintoma:** 4xx/5xx acima do normal.
- **Risco:** perda de receita.
- **Ação imediata:** validar payloads e rota pública de checkout.
- **Quem acionar:** engenharia backend.
- **Como conter:** rollback da mudança recente.
- **Como recuperar:** corrigir validações e revalidar smoke.
- **Como validar:** smoke do checkout sem 500.
- **Como documentar:** timeline e correção definitiva.

### Admin indisponível
- **Sintoma:** acesso ao admin falhando.
- **Risco:** operação sem ferramentas.
- **Ação imediata:** validar host-routing (`admin.flipform.com.br`) e autenticação.
- **Quem acionar:** engenharia.
- **Como conter:** executar ações críticas via API protegida, se necessário.
- **Como recuperar:** corrigir middleware/host/env.
- **Como validar:** login admin + páginas críticas.
- **Como documentar:** causa e mitigação.

### Banco indisponível
- **Sintoma:** falha em endpoints dependentes de DB.
- **Risco:** indisponibilidade ampla.
- **Ação imediata:** verificar readiness e status do provedor de banco.
- **Quem acionar:** engenharia + infra.
- **Como conter:** comunicar indisponibilidade e pausar jobs.
- **Como recuperar:** restaurar conectividade/instância.
- **Como validar:** readiness verde + smoke essencial.
- **Como documentar:** RCA e plano preventivo.

### Cron/reconciliação falhou
- **Sintoma:** jobs internos com erro.
- **Risco:** drift de billing/status.
- **Ação imediata:** validar `CRON_SECRET`/`INTERNAL_JOB_SECRET` e logs.
- **Quem acionar:** engenharia backend.
- **Como conter:** disparo manual monitorado.
- **Como recuperar:** corrigir erro e reprocessar.
- **Como validar:** jobs com sucesso em sequência.
- **Como documentar:** causa raiz e ação corretiva.

### Sentry com pico de erros
- **Sintoma:** volume anormal de exceções.
- **Risco:** degradação silenciosa.
- **Ação imediata:** filtrar por rota/deploy.
- **Quem acionar:** engenharia responsável da release.
- **Como conter:** rollback parcial/feature flag.
- **Como recuperar:** patch e novo deploy.
- **Como validar:** normalização do volume de erros.
- **Como documentar:** incidente e aprendizado.

### Env de produção ausente/incorreta
- **Sintoma:** falhas após deploy.
- **Risco:** indisponibilidade parcial.
- **Ação imediata:** rodar `npm run env:check`.
- **Quem acionar:** engenharia + operação.
- **Como conter:** rollback para release estável.
- **Como recuperar:** corrigir variáveis e redeploy.
- **Como validar:** env check + build + smoke.
- **Como documentar:** lista de envs afetadas.

### Perda de dados
- **Sintoma:** registros críticos ausentes.
- **Risco:** impacto operacional e legal.
- **Ação imediata:** congelar operações destrutivas e preservar evidências.
- **Quem acionar:** engenharia, operação e liderança.
- **Como conter:** snapshot do estado atual e isolamento do problema.
- **Como recuperar:** restaurar backup em ambiente controlado e validar.
- **Como validar:** reconciliação de amostras e smoke pós-restore.
- **Como documentar:** escopo, janela de perda e comunicação.

### Corrupção de dados
- **Sintoma:** registros inconsistentes/inválidos.
- **Risco:** decisões erradas e falhas em cascata.
- **Ação imediata:** interromper jobs que alteram dados.
- **Quem acionar:** engenharia backend + operação.
- **Como conter:** limitar escrita enquanto investiga.
- **Como recuperar:** correção por script controlado ou restore parcial.
- **Como validar:** queries de consistência e smoke.
- **Como documentar:** origem e medidas preventivas.

### Restore emergencial
- **Sintoma:** necessidade de recuperação rápida do banco.
- **Risco:** indisponibilidade prolongada.
- **Ação imediata:** confirmar backup íntegro e janela de impacto.
- **Quem acionar:** engenharia responsável + aprovador operacional.
- **Como conter:** comunicar modo manutenção.
- **Como recuperar:** executar restore com dupla confirmação.
- **Como validar:** prisma validate, build e smoke.
- **Como documentar:** horário, origem backup e resultado.

### Backup indisponível
- **Sintoma:** backup não localizado/inválido.
- **Risco:** impossibilidade de recuperação.
- **Ação imediata:** localizar cópia secundária e validar retenção.
- **Quem acionar:** operação + engenharia.
- **Como conter:** pausar ações destrutivas.
- **Como recuperar:** restaurar estratégia de backup e testar novo ciclo.
- **Como validar:** execução de drill completo.
- **Como documentar:** falha de processo e correção.

### Vazamento acidental de dump
- **Sintoma:** arquivo dump compartilhado indevidamente.
- **Risco:** incidente de segurança/LGPD.
- **Ação imediata:** remover acesso, invalidar links e registrar incidente.
- **Quem acionar:** segurança, jurídico e liderança.
- **Como conter:** revogar credenciais potencialmente associadas.
- **Como recuperar:** rotação de segredos e revisão de controles.
- **Como validar:** checklist de contenção concluído.
- **Como documentar:** incidente completo e comunicação obrigatória.

### DATABASE_URL exposto
- **Sintoma:** credencial visível em log/PR/documento.
- **Risco:** acesso não autorizado ao banco.
- **Ação imediata:** rotacionar credencial imediatamente.
- **Quem acionar:** engenharia + segurança.
- **Como conter:** remover conteúdo exposto e invalidar tokens relacionados.
- **Como recuperar:** atualizar envs e reiniciar serviços.
- **Como validar:** conectividade com nova credencial e ausência de exposição.
- **Como documentar:** vetor de exposição e correção.

### Falha no restore
- **Sintoma:** restore interrompido com erro.
- **Risco:** atraso de recuperação.
- **Ação imediata:** preservar logs e validar integridade do dump.
- **Quem acionar:** engenharia backend.
- **Como conter:** repetir em ambiente isolado antes de novo corte.
- **Como recuperar:** corrigir pré-requisitos/versões e reexecutar.
- **Como validar:** prisma validate + smoke pós-restore.
- **Como documentar:** causa técnica e ação preventiva.

## Comunicação
Registrar impacto, escopo, ETA de mitigação e atualização ao cliente.
## Relacionado
- [Final Production Readiness](./final-production-readiness.md)
- [Audit Handoff](./audit-handoff.md)

