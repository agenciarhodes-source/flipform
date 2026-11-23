# PR629 — Registro de responsabilidade e pauta de revisão jurídica

**Data da declaração:** 23/11/2026  
**Responsável pela decisão e coordenação:** proprietário/representante da Pollo/FlipForm, por autodeclaração nesta conversa do projeto.  
**Alcance:** política de retenção e preservação dos dez conjuntos de dados novos da API v1, sujeita à revisão jurídica necessária.  
**Estado atual:** revisão jurídica pendente, política não aprovada, liberação de produção **NO_GO**.

> Esta designação **não** representa aprovação dos dez prazos de retenção, parecer jurídico, nomeação automática de encarregado de dados (DPO), autorização para apagar dados reais, publicar endpoints ou mesclar PRs.

## Providências do responsável

1. Encaminhar ao jurídico/privacidade o workbook `docs/security/api-v1-retention-decision-workbook-20261122.json` e a proposta `docs/security/api-v1-retention-approval-guide-20261122.md`.
2. Definir, por categoria, finalidade, base legal, prazo, evento que inicia a contagem, exceções por litígio/segurança/legal hold, tratamento de direitos dos titulares e descarte/anonimização.
3. Exigir atenção ao fato de que `/api/account/delete-request` registra um **pedido** e `/api/admin/lgpd` registra **status**, sem executar, por si, exclusão física. O status `processed` não comprova apagamento.
4. Verificar os fluxos legados de exclusão para compatibilidade com as dez FKs da API em `ON DELETE RESTRICT` e garantir que evidências críticas não desapareçam por cascata.
5. Após revisão jurídica documentada, deliberar formalmente cada categoria, arquivar referência, data, responsável, procedimento de execução e critérios de revisão; até lá, manter o status `PENDING`.

## Ficha de decisão para o parecer jurídico

Cada linha abaixo corresponde a uma tabela já inventariada no workbook. Não preencher automaticamente prazos ou base legal.

| Tabela | Categoria | Finalidade e base legal | Prazo / marco inicial | Legal hold / descarte | Decisão |
|---|---|---|---|---|---|
| `api_v1_integrations` | Integrações (configuração) | A definir | A definir | A definir | PENDENTE |
| `api_v1_credentials` | Credenciais M2M | A definir | A definir | A definir | PENDENTE |
| `tenant_entitlement_grants` | Concessões de direito | A definir | A definir | A definir | PENDENTE |
| `api_v1_credential_audits` | Auditoria de credenciais | A definir | A definir | A definir | PENDENTE |
| `api_v1_quota_buckets` | Cotas / rate limit | A definir | A definir | A definir | PENDENTE |
| `api_v1_idempotency_records` | Deduplicação | A definir | A definir | A definir | PENDENTE |
| `api_v1_inbox_events` | Eventos recebidos | A definir | A definir | A definir | PENDENTE |
| `api_v1_outbox_events` | Eventos a entregar | A definir | A definir | A definir | PENDENTE |
| `api_v1_webhook_replays` | Prevenção de replay | A definir | A definir | A definir | PENDENTE |
| `api_v1_delivery_attempts` | Tentativas de entrega | A definir | A definir | A definir | PENDENTE |

## Registro formal a completar após a revisão

- **Revisor(a) jurídico(a)/privacidade:** não designado(a)
- **Referência do parecer e versão:** pendente
- **Data da revisão jurídica:** pendente
- **Dono do processo de atendimento a pedidos LGPD:** pendente
- **Decisões técnicas por categoria:** 10/10 pendentes
- **Manifestação expressa do responsável após a revisão:** pendente
- **Referência de aprovação formal:** pendente
- **Próxima reavaliação e evidência:** a definir

## Limites do aceite para publicação

Mesmo uma política revisada e aprovada **não substitui** o aceite operacional de egress do staging e de recuperação por ponto no tempo, nem autoriza automaticamente migração, deploy, merge ou ativação de API na produção.

**Referências:** workbook PR629; ADR PR01-009; `docs/security/api-v1-release-decision-summary-20261123.md`.

**Situação neste commit:** responsável designado para coordenar e deliberar, parecer pendente, política pendente, `NO_GO` preservado.
