# PR629 — viabilidade dos marcos de retenção da API v1 (somente diagnóstico)

**23/11/2026. Sem aprovação jurídica ou empresarial, sem expurgo, produção NO_GO.**

O documento de prazos candidatos foi confrontado com o esquema real das **dez tabelas** na branch Neon QA `br-snowy-band-bcb0auy6` (somente `information_schema.columns`, sem dados pessoais) e com as definições `prisma/schema.prisma`. Constatamos que a política não pode ser automatizada para todas as categorias no esquema atual, mesmo depois de se escolherem períodos.

## Resultado por grupo

| Grupo | Tabelas | Diagnóstico |
|---|---|---|
| Marco inicial ausente ou insuficiente | `api_v1_integrations`, `api_v1_quota_buckets`, `api_v1_idempotency_records`, `api_v1_inbox_events`, `api_v1_outbox_events` | **5 bloqueios** para retenção automática |
| Marco disponível, mas dependências e estado exigem verificação | `api_v1_credentials`, `tenant_entitlement_grants`, `api_v1_credential_audits`, `api_v1_delivery_attempts` | **4 condicionais** |
| Expiração registrada, ainda sem prazo legal aprovado | `api_v1_webhook_replays` | **1 tecnicamente contabilizável**, política pendente |

### Ajustes de dados a projetar antes de implementar limpeza produtiva

- **Integrações:** `updatedAt` muda em edições, não prova a data definitiva de desativação. Propor `disabledAt` imutável por transição, com semântica de reativação.
- **Quotas:** `windowStart` isolado não determina o encerramento da janela quando regras por operação mudarem. Propor `windowEnd` persistido ou duração versionada.
- **Idempotência:** `createdAt` não prova conclusão. Propor `completedAt` associado à cadeia de eventos.
- **Inbox:** `state` e `createdAt` não fixam o instante final. Propor `finalizedAt` em transição de estado terminal.
- **Outbox:** `updatedAt` não comprova entrega final ou DLQ resolvida. Propor `finalizedAt` e política explícita de reconciliação.

Mesmo nas demais cinco categorias, **nenhuma limpeza pode ocorrer** sem elegibilidade, falta de dependências, revisão de obrigações contratuais e jurídicas e controle de `legal hold`. O banco possui dez FKs `RESTRICT`; não modificá-las para `CASCADE` apenas para facilitar expurgo.

## Teste negativo executável

`python3 -m unittest discover -s tests -p test_pr629_retention_clock_gate.py -v` verifica o esquema Prisma e a lista de dez decisões. A falha é esperada se uma tabela for retirada, algum campo for descrito incorretamente ou a avaliação pretender autorizar produção/limpeza. Não conecta Neon e não altera banco.

**Decisão:** manter os prazos de 1/7/30/90/180/365 dias como **candidatos**, não preencher as datas da matriz aprovada e não desenvolver worker de descarte enquanto as regras e os marcos não forem definidos. Este é apenas um diagnóstico de requisitos, não uma migração autorizada.
