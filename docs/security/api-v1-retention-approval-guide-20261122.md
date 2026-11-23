# FlipForm API v1 — caderno de decisão de retenção/LGPD (PR #629)

**Estado: PROPOSTA, SEM APROVAÇÃO. Produção e novos endpoints de exclusão continuam NO_GO.**

## O que já é comprovado
- As dez FKs novas da API v1 usam `ON DELETE RESTRICT` no laboratório de QA. Isso previne exclusões em cascata entre essas relações, **não** estabelece prazo de retenção ou conformidade LGPD.
- As credenciais da QA foram revogadas e as integrações desativadas; testes sintéticos A/B e clone de recuperação passaram em escopo limitado.
- O serviço de limpeza `lib/api-v1/retention-observability.ts` opera somente em CI local descartável e possui dry-run por padrão. A janela de 24h após expiração para webhook replay é **demonstração**, não prazo de produção.
- `/api/v1/leads` retorna IDs operacionais e datas correlacionáveis. Esses dados são **pseudonimizados, não anônimos**.

## Decisões necessárias, sem inventar prazos
| Categoria / tabela | Finalidade principal | Marco inicial sugerido para retenção | Decisão pendente |
|---|---|---|---|
| `api_v1_integrations` | Configurar integração por tenant, controlar status e vínculo organizacional | Desativação definitiva da integração e reconciliação de dependências | Base legal, prazo, hold e destino |
| `api_v1_credentials` | Autenticação M2M, rotação, revogação e prevenção de abuso | Revogação/expiração da chave e encerramento da janela de investigação aplicável | Base legal, prazo, hold e destino |
| `tenant_entitlement_grants` | Registrar direito de acesso excepcional, início/fim, justificativa e aprovador | Fim ou revogação da concessão mais período de contestação/avaliação aprovado | Base legal, prazo, hold e destino |
| `api_v1_credential_audits` | Registrar emissão, rotação e revogação de chaves para detecção/investigação | Última atividade relacionada mais janela de segurança e obrigação de conservação aprovadas | Base legal, prazo, hold e destino |
| `api_v1_quota_buckets` | Garantir limitação distribuída de requisições e detectar abuso | Término da janela configurada e margem operacional contra repetição/replay | Base legal, prazo, hold e destino |
| `api_v1_idempotency_records` | Evitar duplicação de eventos ou efeitos durante reenvio | Fechamento do horizonte de deduplicação e de toda entrega/retry relacionada | Base legal, prazo, hold e destino |
| `api_v1_inbox_events` | Rastrear recebimento e estado de eventos de diagnóstico/integração | Fechamento do evento, última entrega e eventuais investigações | Base legal, prazo, hold e destino |
| `api_v1_outbox_events` | Controlar entrega durável, retries, leases e reconciliação | Entrega final conciliada ou dead-letter resolvida | Base legal, prazo, hold e destino |
| `api_v1_webhook_replays` | Rejeitar repetição de webhooks através de nonce e hash | Prazo de expiração do nonce e margem de proteção aprovada | Base legal, prazo, hold e destino |
| `api_v1_delivery_attempts` | Acompanhar tentativas, falhas e resultado de envio | Fechamento da entrega, investigação de incidente e período de retenção aprovado | Base legal, prazo, hold e destino |

## Proposta de procedimento de aprovação (não implementa nada)
1. **Responsável de privacidade/jurídico designado** define para cada tabela: finalidade, base legal aplicável, prazo máximo e marco inicial. Justifica as exceções e as referências de aprovação; não assumir genericamente obrigação legal por padrão.
2. **Responsável técnico** valida minimização, direitos dos titulares, concorrência entre retenção e chave de segurança, janela de quota, idempotência, retries, DLQ e eventual arquivo de auditoria com acesso mínimo.
3. **Responsáveis técnico e privacidade** verificam os processos de exclusão de clientes/tenants já existentes. As FKs `RESTRICT` podem impedir hard-delete enquanto houver histórico; definir solução de retenção/anonimização compatível, não transformar em `CASCADE` para destravar.
4. **Legal hold**: especificar quem pode criar, revisar e encerrar a suspensão de descarte, com motivo, vencimento/revisão e trilha de auditoria. Não aplicar legal hold em massa sem justificativa.
5. **Procedimento de descarte**: dry-run, escopo tenant, limite de linhas, transação e registro de auditoria; proibida exclusão de evento pendente, chave ativa ou prova sob retenção obrigatória. Só implementar job de produção após aceite.
6. **Formalização**: preencher no arquivo JSON os campos `retention_period`, `lawful_basis`, `legal_hold_rule`, `owner_for_approval` e `decision_reference` sob revisão externa ao gate, com autorização expressa. **Não editar diretamente os gates `NO_GO` só para deixar CI verde.**

## Pendências que continuarão após aprovação documental
Aprovação de política não substitui teste de PITR/backup, comprovação de egress do aplicativo, compatibilidade com funções/rotas atuais de exclusão nem autorização separada do rollout de produção.

Referências internas: `docs/security/pr01-phase9-retention-decision-matrix.json`, `docs/security/pr01-staging-release-gates-DRAFT.json`, `docs/security/api-v1-homologation-runbook-20261121.md`.
