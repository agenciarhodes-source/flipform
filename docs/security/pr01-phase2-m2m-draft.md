# PR01 — Fase 2 | Modelo Prisma e leitura de credenciais M2M (DRAFT)

**19/11/2026 — Escopo autorizado:** desenvolvimento isolado no PR #627, sem merge, deploy, acesso Neon, migrations, dados reais, emissão de chaves, flags de runtime ou ativação de integrações.

## O que este commit realmente entrega

- **Schema aditivo, ainda não migrado**: `ApiIntegration` (status default `disabled`), `ApiCredential` (hash e escopos, revogação/expiração) e `TenantEntitlementGrant` (concessão limitada por tenant, data, aprovador e motivo).
- **FK composta de tenant**: `ApiCredential(tenantId,integrationId)` referencia `ApiIntegration(tenantId,id)`; uma credencial não pode apontar para integração de outra empresa.
- **Reader server-only** em `lib/api-v1/prisma-credential-repository.ts`: consulta somente credenciais de integração ativa, retorna planos/assinaturas e grants válidos do tenant e recusa por padrão um espelho de assinatura `business_group` sem grant próprio.
- **Autorização de gestão**: consulta membership real no banco, aceita somente `owner` ativo da própria empresa e passa pelo entitlement. `platform_admin` não herda direito de emitir chave.
- **Quota indisponível**: `consumeQuota` lança erro (resposta fail-closed 503 no módulo de autenticação). Ainda não há rate store distribuída, emissão/revogação de chave, endpoint funcional nem autenticação da rota status.
- **CI com DB descartável**: testes sintéticos de FKs A/B, Premium/Inbox/grant/revogação, role, suspensão e deny-by-default no PostgreSQL local `flipform_ci`, sem URLs Neon.
- **API pública continua OFF**: a rota `/api/v1/status` preserva 404 quando a flag falta e 503 caso habilitada sem backend. Nada aqui cria credencial ou chama sistema externo.

## Gates ainda abertos

1. Reconciliar a elegibilidade de billing por assinatura e grupo: `business_group` está bloqueado no reader até uma política positiva de payer/grupo ser homologada. Alterar plano, preço e catálogo está fora do escopo.
2. Implementar com ADR, auditoria e testes a administração de chaves (geração CSPRNG, exibição uma vez, rotação, revogação, trilha sem segredos); **nenhuma chave foi emitida**.
3. Implementar quota distribuída atômica e idempotência durável, inbox/outbox, webhook HMAC/antirreplay/SSRF e mecanismo de kill-switch; antes disso não ligar a API.
4. Validar SQL/migration aditiva e rollback em banco descartável; **não há arquivo migration gerado ou aplicado nesta etapa**.
5. Staging runtime/egress ainda não homologado no PR00; #623, #624, #625, #626 continuam com seus gates de release próprios.
6. Revisar CI, Prisma validate, TypeScript, teste real no PostgreSQL sintético, regressões e scan antes de declarar a Fase 2 aprovada.

## Rollback antes de qualquer merge

Enquanto tudo estiver nesta branch Draft, rollback consiste em reverter os commits da Fase 2. **Não foi executada mudança de DB**, logo não há rollback de dados. Na futura liberação, migrar somente após novo aceite, com rollback específico aprovado e testes de integridade.

**Nenhuma etapa aqui autoriza deploy, merge, Neon, SQL de produção ou reativação dos quatro workflows de reparação.**
