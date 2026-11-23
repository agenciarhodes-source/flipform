# PR01 — Fase 3 | Gestão de chaves M2M e quota distribuída (DRAFT)

**Data:** 19/11/2026 · **PR:** #627 · **Branch:** `feature/pr01-global-api-foundation`.

**Escopo autorizado:** desenvolvimento de código e testes sintéticos em branch Draft. **Não autorizado:** merge, deployment, Neon, migration/DDL em ambientes reais, chaves de clientes, acesso a dados reais, flags de ambiente, Meta/Google/Pixel/WhatsApp/Stripe ou workflows de reparação.

## Implementações propostas, sem exposição HTTP

1. `ApiCredentialAudit` aditivo: trilha de `issued`, `rotated_from`, `rotated_to` e `revoked` com ator, tenant, integração e ID da chave; nenhum token/senha/segredo em logs.
2. `ApiV1QuotaBucket` aditivo: chave composta por tenant, integração, credencial, operação e janela UTC, com update atômico guardado por `consumed < limit`, sem contador em memória. O bucket é dependente de credencial válida.
3. `lib/api-v1/credential-lifecycle.ts`: serviço `server-only` para emitir, rotacionar e revogar; valida proprietário ativo e assinatura/grant server-side; segredo CSPRNG 32 bytes guardado somente como SHA-256, token retornado uma única vez ao chamador autenticado. Emissão e auditoria ocorrem numa transação; rotação revoga anterior, cria substituta e audita na mesma transação; revogação jamais apaga a chave.
4. `PrismaApiV1CredentialRepository.consumeQuota`: somente quando uma `ApiV1QuotaPolicy` confiável for explicitamente injetada. Não há limite numérico padrão nem variável de ambiente habilitada; sem política, nega com 503 por falha segura.
5. `authorizeApiV1Request`: entrega o ID da credencial validada ao limitador, impedindo contabilização por ID arbitrário do corpo da requisição.
6. Auditor SQL PR00 preserva exatamente os 92 modelos originais e enumera **apenas cinco modelos aditivos autorizados** do PR01. Nenhum schema foi aplicado em Neon.

## Testes com PostgreSQL local descartável (CI)

- Proprietário ativo do tenant A com Premium válido pode emitir chave somente para uma integração ativa do A; viewer B não pode emitir; nenhum ator pode indicar integração B usando tenant A.
- O banco registra apenas digest, não bearer; auditoria registra eventos sem segredo.
- Rotação troca chave, mantém escopos, revoga antiga e nega nova rotação da antiga; revogação é tenant-scoped e idempotente.
- Dez chamadas simultâneas para mesma credencial/rota/intervalo com política sintética de 2 chamadas permitem exatamente 2, negando 8 (teste de atomicidade).
- Sem política de quota a autorização falha de modo seguro.
- CI + Playwright + Gitleaks + Semgrep devem permanecer verdes.

## Atenção a decisões ainda não homologadas

- **A API /api/v1/status segue 404 quando flag OFF e 503 quando backend não conectado**. O ciclo de chave é código server-only **sem nenhuma rota de criação ou exposição de token**; não há chaves reais emitidas.
- Os valores de quotas, tamanho das janelas, limites de emissão, políticas de TTL, como disponibilizar a chave uma única vez ao owner, auditoria de sessões, step-up/MFA e prevenção de abuso ainda exigem ADR e aprovação. Valores no teste são **exclusivamente sintéticos**.
- O limitador agregado por empresa/integração/rota, retenção e limpeza de buckets e métricas ainda precisam de desenho e homologação; esta Fase 3 implementa **somente limite por credencial**.
- A identidade do ator usada no serviço deverá vir de uma sessão humana autenticada server-side; nenhum JSON/client deve poder fornecer `userId`, `role` ou `tenantId` confiáveis.
- Antes de publicar: migration aditiva revisada (não criada nesta fase), staging runtime isolado com egress controlado, integração da camada de autenticação ao endpoint, idempotência durável, webhooks HMAC/SSRF, testes de regressão e política de rollback.
- PRs #623–#626 seguem independentes e com seus bloqueios de release; quatro workflows de reparação devem permanecer Disabled. O status na interface não foi revalidado por esta mudança.

**GO restrito a desenvolvimento offline; NO-GO para merge, deploy, Neon, chaves reais ou integração com CRM/Ads.**
