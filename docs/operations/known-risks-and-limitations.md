# Known Risks and Limitations

## Técnico
- **Risco:** divergência entre comportamento local e produção em integrações externas.
- **Impacto:** médio
- **Probabilidade:** média
- **Mitigação atual:** smoke + env checks + runbooks
- **Ação recomendada:** ampliar monitoramento por rota crítica
- **Bloqueia go-live?:** não

## Segurança
- **Risco:** configuração incorreta de secrets/env em produção.
- **Impacto:** alto
- **Probabilidade:** média
- **Mitigação atual:** `env:check`, readiness protegido
- **Ação recomendada:** revisão dupla pré-go-live
- **Bloqueia go-live?:** sim

## Billing
- **Risco:** webhook Asaas em produção não validado com evento real controlado.
- **Impacto:** alto
- **Probabilidade:** média
- **Mitigação atual:** simulação sandbox e reconciliação manual
- **Ação recomendada:** teste controlado com cliente piloto
- **Bloqueia go-live?:** sim

## E-mail
- **Risco:** entregabilidade depende de SPF/DKIM/DMARC corretos.
- **Impacto:** alto
- **Probabilidade:** média
- **Mitigação atual:** runbook transacional
- **Ação recomendada:** validar DNS e envio real controlado
- **Bloqueia go-live?:** sim

## LGPD
- **Risco:** textos e política exigem revisão jurídica antes de escala ampla.
- **Impacto:** alto
- **Probabilidade:** média
- **Mitigação atual:** documentação operacional existente
- **Ação recomendada:** aprovação jurídica formal
- **Bloqueia go-live?:** sim

## Operação
- **Risco:** restore em produção depende de procedimento manual com dupla confirmação.
- **Impacto:** alto
- **Probabilidade:** baixa
- **Mitigação atual:** scripts com bloqueio e drill
- **Ação recomendada:** simulações periódicas
- **Bloqueia go-live?:** não

## UX
- **Risco:** primeiros clientes podem ter atritos não mapeados no onboarding.
- **Impacto:** médio
- **Probabilidade:** média
- **Mitigação atual:** runbook de piloto 48h
- **Ação recomendada:** coleta ativa de feedback
- **Bloqueia go-live?:** não

## Infra
- **Risco:** regressões de deploy/cache podem afetar app/admin.
- **Impacto:** médio
- **Probabilidade:** baixa
- **Mitigação atual:** CI/smoke + checklists
- **Ação recomendada:** deploy canário e rollback testado
- **Bloqueia go-live?:** não
\n- Tenant Integrations/Pixels/GTM/GA4/Kanban tracking: implementado (ver tenant-integrations-tracking.md).
