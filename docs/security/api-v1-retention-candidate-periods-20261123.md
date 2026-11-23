# FlipForm API v1 — proposta inicial de prazos de retenção (PR #629)

**23 de novembro de 2026 · SOMENTE PARA DISCUSSÃO · NÃO É POLÍTICA APROVADA · PRODUÇÃO NO_GO**

A Política de Retenção da Pollo/FlipForm ainda está pendente de manifestação do responsável e revisão jurídica. Não existe prazo universal fixado pela LGPD; o prazo depende da finalidade, necessidade, papel de controlador/operador, contrato e hipóteses legais de conservação (LGPD arts. 6, 7, 11, 15 e 16). Os valores abaixo **não são exigências legais nem agendamentos de descarte**. Não constam no workbook como períodos aprovados.

## Quadro preliminar — um prazo distinto para cada categoria

| Conjunto | Prazo candidato após marco inicial | Marco inicial do prazo |
|---|---:|---|
| Integrações | 90 dias | Desativação definitiva e conciliação |
| Credenciais | 180 dias | Revogação/expiração |
| Concessões de acesso | 365 dias | Fim da concessão |
| Auditoria de chaves | 365 dias | Último evento relevante |
| Rate limit | 7 dias | Fim da janela |
| Idempotência | 30 dias | Operação concluída |
| Eventos Inbox | 90 dias | Evento conciliado |
| Eventos Outbox | 90 dias | Entrega/DLQ encerrada |
| Antirreplay | 24 horas | Expiração do nonce |
| Tentativas de entrega | 180 dias | Última tentativa fechada |

### `api_v1_integrations` — 90 dias (candidato)

**Por que foi sugerido:** Janela curta para desfazer erros administrativos ou resolver encerramento contratual; configuração desvinculada depois de cessada a finalidade. **Contagem:** Desativação definitiva da integração, após conciliação de todas as dependências. **Não eliminar enquanto:** Credenciais ou eventos dependentes pendentes; Retenção obrigatória ou litígio individualmente documentados. **Destino proposto:** Excluir configuração ou reduzir vínculos após análise de FKs; não eliminar auditoria crítica em cascata.

### `api_v1_credentials` — 180 dias (candidato)

**Por que foi sugerido:** Permitir investigação de abuso e correlação de chaves usadas; nunca conservar token bruto. **Contagem:** Revogação ou expiração efetiva da chave, o que ocorrer por último. **Não eliminar enquanto:** Chave ainda ativa; Investigação de segurança aberta; Auditoria/quotas dependentes ainda retidas. **Destino proposto:** Eliminar hash e metadados após prazo/pendências; trilhas de auditoria seguem prazo próprio.

### `tenant_entitlement_grants` — 365 dias (candidato)

**Por que foi sugerido:** Comprovação de quem autorizou acesso excepcional e tratamento de contestação; reduzir justificativas com identificadores. **Contagem:** Fim/revogação de concessão excepcional. **Não eliminar enquanto:** Reclamação ou contestação aberta; Base legal contratual/regulatória específica a avaliar. **Destino proposto:** Eliminar ou anonimizar concessão e justificativa quando nenhuma evidência obrigatória restar.

### `api_v1_credential_audits` — 365 dias (candidato)

**Por que foi sugerido:** Trilha operacional de segurança para esclarecer eventos e revogações; proteção por acesso restrito. **Contagem:** Último evento relevante de emissão, rotação ou revogação associado. **Não eliminar enquanto:** Incidente ou investigação em aberto; Preservação específica legal documentada. **Destino proposto:** Expurgo auditado ou arquivo minimizado conforme base legal aprovada, não por cascade.

### `api_v1_quota_buckets` — 7 dias (candidato)

**Por que foi sugerido:** Registro transitório necessário para evitar zerar contadores e permitir diagnóstico operacional curto. **Contagem:** Fim efetivo da janela de limitação (window_start + duração configurada). **Não eliminar enquanto:** Janela ainda vigente; Evento de abuso pendente documentado. **Destino proposto:** Limpeza por lotes com limites de tenant e logs de contagem, após janela segura.

### `api_v1_idempotency_records` — 30 dias (candidato)

**Por que foi sugerido:** Reduzir duplicações após reenvio sem reter hashes indefinidamente. **Contagem:** Conclusão da operação e encerramento da deduplicação, sem entregas ou retries pendentes. **Não eliminar enquanto:** Inbox/outbox dependente; Retry, DLQ, entrega ou disputa em aberto. **Destino proposto:** Expurgo após fechamento da cadeia referencial, em ordem segura.

### `api_v1_inbox_events` — 90 dias (candidato)

**Por que foi sugerido:** Janela limitada de suporte e diagnóstico pós-processamento de eventos. **Contagem:** Evento concluído e conciliado, sem dependentes/pendências. **Não eliminar enquanto:** Evento held, queued, retry ou em investigação; Outbox/entregas dependentes não concluídas. **Destino proposto:** Expurgo/anonimização sem perder eventos necessários ao suporte e auditoria.

### `api_v1_outbox_events` — 90 dias (candidato)

**Por que foi sugerido:** Reconciliar entregas, retries e estados, evitando retenção sem conclusão. **Contagem:** Entrega concluída e reconciliada ou DLQ resolvida formalmente. **Não eliminar enquanto:** Lease ativo, retry pendente ou DLQ não resolvida; Tentativa ou auditoria crítica dependente. **Destino proposto:** Expurgo de estado final após conciliação e fechamento dos dependentes.

### `api_v1_webhook_replays` — 24 horas (candidato)

**Por que foi sugerido:** Proteção adicional candidata de 24h pós-expiração, inspirada apenas pelo ensaio sintético PR01, não homologada para produção. **Contagem:** Expiração do nonce do webhook (expires_at). **Não eliminar enquanto:** Período antirreplay ainda ativo; Tentativa de abuso sob investigação. **Destino proposto:** Remoção por lotes de hashes expirados com proteção contra replay e contagem auditada.

### `api_v1_delivery_attempts` — 180 dias (candidato)

**Por que foi sugerido:** Histórico de erro e entrega para investigação com menor exposição de payload. **Contagem:** Última tentativa concluída, após o encerramento do evento/outbox. **Não eliminar enquanto:** Falha ou disputa aberta; Evento de origem ainda ativo ou legal hold individual. **Destino proposto:** Arquivo minimizado ou expurgo controlado por lote sem apagar auditoria exigida.

## Salvaguardas para aprovação futura

- Não executar limpeza de nenhuma tabela enquanto a política não estiver formalmente aprovada. Manter API de produção OFF e `retention_and_lgpd_approved=false`.
- Os dez vínculos atuais usam `ON DELETE RESTRICT`. Isso pode **impedir** o descarte mesmo depois de vencido o prazo; precisa de um plano de eliminação em ordem referencial e proteção de auditorias, nunca mudar para `CASCADE` apenas por conveniência.
- Ao receber pedido de exclusão, verificar caso a caso a obrigação contratual/controle do cliente, o enquadramento legal e a comprovação da execução. O status `processed` no painel LGPD não é evidência automática de exclusão física.
- **Legal hold** deve ter justificativa individual, responsável, evento disparador e data periódica de reavaliação. Não é autorização para guarda indefinida.
- Prazos para dados de leads, dados sensíveis de clínicas, cópias de backup, faturamento e obrigações fiscais **não estão cobertos** por este quadro.
- O exemplo de 24h após `expires_at` no antirreplay é extraído do CI sintético PR01 e **não constitui configuração real de produção**.

## Pontos a decidir pelo proprietário com revisão jurídica

1. Confirma ou ajusta os dez prazos candidatos, justificando as diferenças por finalidade e obrigações.
2. Identifica para cada conjunto se a Pollo é controladora ou operadora e qual base legal/contrato ampara a conservação.
3. Define a retenção de auditoria mínima, quem pode aplicar e encerrar `legal hold`, como comprovar eliminação e como lidar com pedidos de titulares.
4. Aprova os critérios de exceção, revisões periódicas e evidências de expurgo. Só **depois** registrar aprovação individual no workbook original e revisar os gates com evidência independente.

## Fontes oficiais consultadas

- Lei nº 13.709/2018 (LGPD), especialmente princípios e término/conservação: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
- ANPD, Perguntas Frequentes — inexistência de prazo universal: https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes
- ANPD, Guia de Agentes de Tratamento (controlador/operador): https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-para-definicoes-dos-agentes-de-tratamento-de-dados-pessoais-e-do-encarregado

**Situação:** `DISCUSSION_DRAFT`; nenhuma aprovação legal ou empresarial ocorreu nesta etapa; não alterar deploy, migrations, ferramentas Meta/Google ou workflows desativados.
