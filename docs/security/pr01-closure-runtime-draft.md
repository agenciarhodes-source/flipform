# PR01 — fechamento técnico consolidado do circuito M2M (DRAFT)

**Data:** 20/11/2026 — PR #627, branch feature/pr01-global-api-foundation.

## Construído neste lote único de alterações

- **Integrações e API** em `app/(app)/integrations/api-v1-card.tsx`, visível somente a proprietário da empresa com a flag global explicitamente habilitada. O backend revalida o ator, tenant, membership owner, plano Premium/Premium Pro ou grant per-tenant e status ativos. A conexão é criada **desativada**.
- **Admin HTTP** em `/api/integrations/api-v1`: listar/criar conexão; `PATCH /{integrationId}` ativar/desativar; `GET/POST /{integrationId}/keys` listar metadados/emitir chave; `POST /{integrationId}/keys/{credentialId}` rotacionar; `DELETE` revogar sem hard delete. Mutations exigem `Origin` e `Sec-Fetch-Site` same-origin, JSON restrito e tamanho de corpo limitado. O usuário/tenant **nunca** é aceito do payload.
- Chaves de 32 bytes aleatórios, hash SHA-256 persistido, expiração por padrão de 30 dias, **somente `integrations.read`** enquanto não existe endpoint de eventos produtivo. Segredo exibido uma vez, nunca retornado no GET. Limites iniciais propostos: quatro integrações por empresa e até cinco chaves não revogadas/não expiradas por integração.
- **GET /api/v1/capabilities**: endpoint M2M real no código, sem objetos de negócio. Autoriza token, integração ativa, entitlement tenant, escopo `integrations.read` e quota atômica `60/minuto` por credencial/operação em PostgreSQL; 401/403/429/503 falham fechados. Sem cookies, sem parâmetros `tenantId` externos, sem dados pessoais/CRM.
- Teste `tests/pr01-closure-m2m.integration.test.ts` no PostgreSQL local descartável: owner A cria integração desativada, ativa, emite chave, consulta capability, rotação e revogação efetivas, negação tenant B e flag OFF; testa CSRF e resposta sem chaves persistidas. Sem conexões ao Neon.
- Contrato `docs/api/openapi-v1.yaml` atualizado apenas para as rotas realmente construídas (nenhum CRUD de lead ou pipeline). `.gitleaks.toml` adiciona allowlist **estrita de três falsos positivos SARIF já inspecionados**, preservando o scanner.

## O que permanece NO-GO, mesmo com CI verde

1. O schema com 10 modelos PR01 foi **apenas ensaiado em PostgreSQL descartável**, jamais migrado em Neon. A API ficará desativada até aprovação separada de migration, staging e rollout. Não habilitar `FLIPFORM_API_V1_ENABLED` nos ambientes reais.
2. **Crítico:** `ON DELETE CASCADE` ainda permite excluir `api_v1_credential_audits` e `api_v1_delivery_attempts`. A ADR de retenção/LGPD/legal hold permanece **PROPOSTA, não aprovada**. Resolver FKs e política de exclusão ANTES de migration.
3. Operação produtiva de webhooks, filas, retries externos, observabilidade/exportação, portais terceiros, PR02 pipeline CRUD, Meta/Ads/Pixel, WhatsApp, Stripe e ERP estão **fora desta entrega** e não podem ser considerados integrados.
4. A UI é um formulário mínimo e ainda exige testes de navegação e aceitação com tenant fictício em staging isolado comprovado. Nenhuma chave real emitida.
5. O sistema de billing `business_group` continua explicitamente **sem entitlement automático**, a menos que um grant auditado seja aprovado.
6. Limites por cliente/empresa, concorrência em criação administrativa, lifecycle de chaves, edge/WAF e demais riscos exigem avaliação adicional antes do rollout. Nenhum endpoint de escrita de negócio está autorizado.
7. PR00 exige prova de isolamento de staging, CI e segurança da main. Não fazer merge, Ready for review, deploy, Neon, alterações em CRM nem reativação de workflows de reparação.

**Critério de validação deste lote:** TypeScript, Prisma, smoke, E2E, Semgrep, Gitleaks e teste de circuito A/B devem passar **no HEAD final**. Esses checks atestam somente o código da branch; não autorizam release.
