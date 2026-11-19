# PR 01 — Fase 1 de implementação isolada, fechada por padrão

**Data:** 19/11/2026 · **PR:** #627 Draft · **Base:** main \`6def5c5ed92920deadd0f83806f057da4219a022\`.

**Autorização contextual do proprietário:** prosseguir para a próxima etapa de implementação de código, conforme limites explicitados no último checkpoint. A autorização aqui documentada cobre exclusivamente branch Draft e CI sintético; **não** cobre mesclar, publicar, configurar a API, executar SQL/Neon, emitir chaves, ativar workflows ou usar dados de clientes.

## Implementado nesta primeira entrega

1. \`vercel.json\`: Preview automático desativado antes da primeira alteração funcional.
2. \`lib/api-v1/policy.ts\`: escopos fechados, checagem pura de entitlements/tenant e autorização conservadora para gerir credenciais (somente proprietário do próprio tenant).
3. \`lib/api-v1/identity.ts\`: parsing rigoroso de bearer opaco, derivação de hash da parte secreta, comparação em tempo constante, vínculo de credencial a tenant/integration, validade/revogação/scope, entitlement e quota. **A fonte de credenciais é uma interface injetada em testes; não é um banco real**. Uma falha do repository ou do limitador nega acesso.
4. \`lib/api-v1/errors.ts\`: respostas genéricas com código, mensagem, requestId aleatório e \`Cache-Control: no-store\`.
5. \`lib/api-v1/idempotency.ts\`: identidade por tenant+integração+operação+chave, e impressão digital de payload **pura**, sem claim persistente nem efeito de negócio.
6. \`app/api/v1/status/route.ts\`: placeholder sem escrita/leitura de banco ou chamada externa. Com \`FLIPFORM_API_V1_ENABLED\` ausente retorna 404; se ligado sem backend pronto retorna 503. **Nenhum caminho retorna 200**.
7. \`docs/api/openapi-v1.yaml\`: OpenAPI 3.1 somente do placeholder real, com bearer registrado como reservado (não é endpoint ativo).
8. Testes offline TypeScript e testes estáticos Python no CI.

## Limitações deliberadas / próximo desenvolvimento

- **Não existe ainda** persistência de \`ApiIntegration\`, \`ApiCredential\` e grants, nem migration DDL local/Neon, administração de chaves reais ou scope no backend HTTP.
- \`authorizeApiV1Request\` é código testado com dependências injetadas; **não é chamado pelo placeholder de rota** e não autentica ninguém em runtime.
- Não há escrita, importação, integração ERP ou pipeline; isso será PR02.
- Não há implementação durável de idempotência, inbox/outbox, delivery worker, webhooks reais, HMAC/anti-replay/SSRF, quotas distribuídas, logs de uso nem UI de administração.
- Não habilitar \`FLIPFORM_API_V1_ENABLED\` em Vercel, nem qualquer token ou secret; a flag permanece **off** em todos os ambientes reais.
- O código da fase 1 deve ser revisado e os checks passarem, mas isso **não resolve os riscos de rollout** registrados em \`docs/security/pr00-pr01-readiness-decision-20261119.md\` (PR #622).
- O catálogo atual tem \`premium-pro\` inativo e regras de grupo/assinatura que precisam ser reconciliadas antes de uma autorização persistente M2M.
- \`canManageApiV1Keys\` limita por padrão ao owner; qualquer mudança de RBAC exigirá revisão expressa, testes e auditoria.
- A autorização para implementação de código **não concede** autorização de merge, Preview, staging ou produção. Para desenvolver o próximo componente, permanecer na branch Draft e continuar usando dados fictícios.

## Portões de segurança PR00 que ficam separados

- #624: CI/Playwright aprovados, mas titularidade de URLs publicadas não validada; evitar merge/deploy e reauditoria repetitiva de fontes.
- #625: CAS proposto e checks verdes; corrida multiconexão PostgreSQL descartável ainda não homologada.
- #626: identidade do Neon staging provada em build de Preview isolado, ainda sem prova autenticada de runtime; middleware da branch **não pode ser mesclado** na main.
- #623: quatro workflows de reparação **permanecem desativados segundo último registro da UI**, não houve consulta em tempo real do estado enabled; \`MAINTENANCE_GATE=disabled\`. Eles continuam em workflows legados sem guard na \`main\`; não reativar, executar ou criar secrets.

**Próximo aceite de codificação:** persistência M2M segura e grants/entitlements ligados a repositório server-side, com migration preparada apenas como arquivo de código (sem execução Neon), provas A/B em banco descartável e critérios de rollback. Nenhum handler de escrita poderá ser ativado sem quota distribuída e idempotência durável.
