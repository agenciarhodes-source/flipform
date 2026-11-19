# PR 00 → PR 01 | Handoff técnico objetivo da API nativa global FlipForm

**Data:** 19/11/2026 · **Base de planejamento:** `Pollo_OS_Plano_Mestre_v6.1_Aprovacao_Tecnica_PR01.md` (16/11/2026), seções 00A.2–00A.5 e 17 / PR 01–02.  
**Base de código:** leitura de `main` do repositório `agenciarhodes-source/flipform` em 19/11/2026.  
**Status:** especificação e checklist para aprovação; **NÃO é implementação, não autoriza codificar endpoints, merge, deploy, migrations, criar secrets ou tocar dados reais**. A arquitetura geral foi aprovada no Plano Mestre, mas a autorização executiva para codificar PR 01 permanece distinta.

## 1. Decisão de ritmo e fronteira

A investigação repetitiva de slugs foi **congelada**. O PR #624 tem CI e Playwright aprovados no commit `6f478b4ae043152465236d70830b41d799421138`; suas correções ficam em Draft e não podem ser publicadas sem um inventário **comercial** dos links legados efetivamente distribuídos e aliases históricos aprovados. Não reabrir auditoria de arquivos de links como condição para elaborar o PR 01.

**Meta do PR 01:** criar dentro do **FlipForm existente** uma fundação `/api/v1` multi-tenant, configurável por cliente elegível, autenticação máquina-a-máquina (M2M) por integração/tenant, scopes, entitlements, chaves, quotas, idempotência, inbox/outbox, assinaturas de webhook, diagnósticos e painel Integrações e API.

**Fronteira rígida:** PR 01 cria *infraestrutura e contratos*; o mapeamento de entidade, roteamento para pipelines, criação/atualização efetiva de leads/operações, conectores de ERP e piloto de cessão de crédito da Junqueira pertencem ao **PR 02**. Não reutilizar `POST /api/leads` como importador de ERP sem as decisões e validações do PR 02. Não acionar conversões de Ads a partir de eventos administrativos da API.

## 2. Fatos de código revisados (não confundir com implementado)

- `prisma/schema.prisma`: existem `Tenant`, `Plan`, `Subscription`, `TenantIntegrationSettings`, `WebhookEvent`; **não foi encontrada nesta revisão** a fundação genérica proposta `ApiIntegration`/`ApiCredential` e outbox própria da API. `WebhookEvent` hoje é relacionado a provedores preexistentes; não reutilizá-lo sem ADR.
- `lib/auth.ts`: sessão humana em cookie/JWT, com contexto `tenantId` e validação de sessão. **Não** usá-la como identidade M2M; a credencial da máquina deve determinar *um único* tenant validado no backend.
- `lib/rate-limit.ts`: fallback em memória quando o DB falha. Este comportamento é existente para fluxos internos; para **escrita pública M2M**, a falha do controle crítico deverá negar a operação (fail-closed), sem herdá-lo automaticamente.
- `lib/platform-audit.ts`: quando não recebe `tenantId`, tenta selecionar um tenant qualquer. **Proibido** para auditoria da API pública multi-tenant; toda operação deve carregar `tenantId` verificado.
- `app/api/leads/route.ts`: entrada humana/CRM e regras próprias de deduplicação/etapa, não é importação empresarial universal.
- Os planos reais, assinaturas/entitlements e grants precisam de reconciliação entre catálogo e regras de backend. Um `premium-pro` no catálogo de código não prova habilitação comercial; não mudar preço, plano ou cobrança automaticamente.

## 3. Contratos propostos (ADRs para aprovação antes de implementar)

| ADR | Regra proposta | Falha segura / critério objetivo |
|---|---|---|
| ADR-01 Identidade M2M | Credencial vinculada a `tenantId + integrationId`; somente hash persistido; segredo mostrado apenas na criação; rotação com janela explicitamente limitada, revogação e expiração verificadas em cada requisição | Credencial inválida/revogada/expirada → 401, nunca procurar tenant alternativo |
| ADR-02 Planos e RBAC | Premium/Premium Pro elegíveis conforme estado real da assinatura; exceção Junqueira configurada por grant explícito auditado; papel humano autorizado para gerar/revogar credenciais; escopos não ampliam RBAC nem plano | Falta de plano/grant/papel/scope → 403, mesmo que UI tenha sido manipulada |
| ADR-03 Modelo de recursos | Enumerar **objetos, campos e rotas autorizáveis**, limitando `pipeline.write`, `customers.read`, `reports.read` à disponibilidade real de cada recurso | Nenhum CRUD genérico, `query` arbitrária, SQL livre ou proxy de URL; `pipeline.write` funcional só no PR 02 |
| ADR-04 Idempotência | Chave composta por `tenantId, integrationId, operation, idempotencyKey`; request fingerprint sem payload em log; gravação transacional e resultado consistente para retries | 10 replays do mesmo pedido → 1 efeito; mesma chave com payload diferente → 409; concorrência simulada |
| ADR-05 Eventos | Inbox/outbox persistentes por tenant, estado e tentativas explícitos; entrega at-least-once + consumidor idempotente, replay manual autorizado; sem publicar automaticamente conversões Meta/Google | Queda/retry sem perda; DLQ/quarentena auditável; jobs nunca atravessam tenant |
| ADR-06 Webhooks | HMAC por assinatura e versão de segredo; timestamp/limite de idade; replay protection; timeout/limites; destino permitido e validado, DNS/redirect/IP tratados contra SSRF | URL privada/loopback, redirect suspeito, assinatura inválida ou replay → bloqueio |
| ADR-07 Quotas/observabilidade | Quota por `tenantId+integrationId+route`, rate limits distribuídos e fail-closed quando verificação indisponível; correlation ID, status, latência e códigos genéricos em logs | Nenhum payload bruto, telefone, nome, segredo, token ou credencial em log; resposta 429 consistente |
| ADR-08 Rollout/retirada | API desabilitada por padrão, flag/grant específicos por tenant; revogação imediata de chaves e parada de jobs de tenant sem apagar importações | Desligamento comprovado em teste; app CRM, atendimento e billing sem mudanças |

**Observação:** os valores numéricos de quota, TTLs, retenção, algoritmo de hashing/rotação, transporte de eventos e nomes finais dos modelos não estão aprovados; são decisões do ADR, não preencher com números inventados.

## 4. Contrato OpenAPI 3.1 — escopo mínimo antes de escrever handler

Criar, no **PR de implementação autorizado futuramente**, o arquivo `docs/api/openapi-v1.yaml` com:
- `openapi: 3.1.0`, `servers` de ambientes não produtivos documentados, prefixo `/api/v1`, `securitySchemes` para credencial M2M e scopes verificáveis pelo servidor.
- Envelope tipado de erro com `code`, `message` seguro, `requestId`; 400 payload inválido, 401 credencial inválida, 403 sem permissão, 404 recurso não visível, 409 idempotência divergente, 429 quota, 503 dependência crítica indisponível. Status exatos em recursos de negócio exigem revisão de contrato.
- Padrão de resposta para diagnósticos autorizados, documentação de rotação/revogação, exemplos **inteiramente fictícios**, paginação limitada, versionamento/backward compatibility e assinatura de webhooks.
- Tabela de endpoints **propostos**, separando rotas de setup/admin humano, diagnóstico M2M e eventos. Não definir ou ativar `POST /api/v1/leads`, `PATCH /api/v1/pipelines` nem operações de importação corporativa antes do PR 02.
- Teste automatizado que valida o YAML e garante correspondência entre spec e rotas somente depois de existirem handlers.

O plano autoriza elaborar o contrato, **não** afirma que esses endpoints já existem.

## 5. Schema aditivo candidato (NÃO criar/migrar neste checkpoint)

Modelos de referência do Plano Mestre, sujeitos a ADR e naming:
`ApiIntegration`, `ApiCredential`, `ApiIdempotencyRecord`, `IntegrationEventInbox`, `IntegrationEventOutbox`, `ApiWebhookSubscription`, `ApiWebhookDelivery`, `TenantEntitlementGrant` (ou equivalentes).

Cada nova entidade exigirá `tenantId` obrigatório onde pertinente; índices/constraints para chaves compostas, expiração, retries e consumo; política de dados/logs sem PII; FKs tenant-safe auditadas e rollback aditivo. Nenhum `prisma migrate deploy` na produção e nenhuma migração destrutiva. Confirmar o desenho de índices e transações antes de publicar um schema.

## 6. Mapa de implementação (somente quando autorizado, não uma ordem de executar agora)

1. **Fundação de segurança:** feature flag off, entidades aditivas sem dados reais, chaves M2M, rota interna de administração e grants com RBAC. Testes A/B, papéis, rotação e revogação. Não expor segredo no cliente depois da criação.
2. **Infraestrutura de API e contratos:** `/api/v1`, OpenAPI executável, validação e erros sanitizados, limites e quotas distribuídos. Somente endpoints diagnósticos não destrutivos previstos pelo contrato.
3. **Eventos e webhooks:** inbox/outbox/assinaturas/retries/idempotência/SSR F, isolamento de jobs e controle de entrega; teste de falha e replay 10x, sem integração real.
4. **Painel Integrações e API:** gestão por tenant e escopos com permissões; logs e diagnósticos sem exposição de segredos. Sem mudança de cobrança ou da navegação geral.
5. **Homologação com staging isolado:** CI + Playwright, teste PostgreSQL sintético concorrente, regressão CRM, Kanban, Inbox, Meta/Google/WhatsApp/Stripe, kill switch e rollback.
6. **PR 02 depois:** somente após aceite separado, implementar CRUD empresarial, mapeamento genérico e piloto Junqueira.

Os itens acima são **fases dentro da proposta PR 01** e podem exigir PRs menores para reduzir risco; nenhum deles está autorizado a iniciar por esta especificação.

## 7. Matriz de aceite PR 01 — evidência objetiva obrigatória

| ID | Evidência a produzir em ambiente isolado | Status em 19/11 |
|---|---|---|
| A01 | Credencial tenant A não lê, escreve, entrega evento nem vê job/webhook do tenant B | PENDENTE |
| A02 | Plano/papel/grant/backend recusam emissão ou uso de chave não elegível | PENDENTE |
| A03 | Rotação, expiração, revogação e zero segredo no browser/log | PENDENTE |
| A04 | 10 retries idem, um efeito; collision com payload diferente, concorrência em DB | PENDENTE |
| A05 | Outbox/inbox/retries/replay sobrevivem a falhas e não perdem eventos | PENDENTE |
| A06 | HMAC, replay, SSRF, redirect, hosts e timeouts testados adversarialmente | PENDENTE |
| A07 | Evento API não dispara Meta/Google; UTMs e atribuição existentes preservados | PENDENTE |
| A08 | Logs com `requestId` sem PII, secrets ou payload completo | PENDENTE |
| A09 | OpenAPI 3.1 validada, exemplos fictícios e suíte contratual | PENDENTE |
| A10 | Regressão CRM/Kanban/tarefas/notificações/Inbox/login/billing/Meta/Google/WhatsApp/Stripe | PENDENTE |
| A11 | Flag off/revogação corta API, mantendo histórico, importações e CRM | PENDENTE |
| A12 | Aprovação humana de escopo, depois autorização independente para merge e produção | PENDENTE |

**Nenhuma evidência de CI dos PRs #623–#626 substitui testes de uma API que ainda não foi implementada.**

## 8. Gates PR 00 que continuam separados, sem travar o trabalho documental

- PR #624: regras de URL por ID e alias histórico em Draft. CI/Playwright **verdes** no commit `6f478b4ae043152465236d70830b41d799421138`, mas **não publicar** sem inventário de campanhas/links legados aprovados; o fallback removido provocaria 404 para URLs antigas sem alias. Não reabrir auditoria repetitiva de código.
- PR #625: CAS de movimentos em Draft, CI/Playwright verdes, mas validação de corrida real em banco sintético ainda pendente.
- PR #623: workflows de manutenção protegidos no Draft; **quatro workflows de reparação continuam Disabled** com `MAINTENANCE_GATE=disabled`. Reabilitação só após integração revisada dos guards e autorização específica; nunca executar reparo nessa transição.
- PR #626: Preview de diagnóstico da identidade de banco passou **no build**; a prova autenticada de runtime está pendente, e o middleware temporário de bloqueio **não é candidato a merge em main**.
- Proteção efetiva de `main`, checks requeridos, rollback, governança de staging e matriz de planos/RBAC devem constar do go/no-go, sem fingir independência de aprovação (operador único).

## 9. Decisão necessária para começar a implementar

**Arquitetura e projeto técnico do PR 01:** aprovados na v6.1.  
**Esta especificação de handoff:** proposta de detalhamento para revisão.  
**Implementação efetiva, PR/branch de código, migrações e deploy:** **NÃO AUTORIZADOS** por este documento.

Após a revisão dos ADRs e apresentação do diff final, solicitar expressamente ao proprietário autorização para **iniciar o PR 01 na branch de implementação**, somente com flags fechadas e testes em ambiente isolado. Autorização de implementação **não equivale** a autorização de merge, staging produtivo, produção ou migração.
