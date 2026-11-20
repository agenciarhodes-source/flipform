# PR01 — Revisão de compatibilidade de exclusões e suspensão (Draft, sem autorização de release)

**Data:** 20/11/2026 · **PR:** #627 · **Alvo:** commit anterior `2ae44378babd` e adendo de testes no próprio PR.  
**Limites:** inspeção de código + testes sintéticos em CI local. Sem dados de clientes, Neon, deploy, merge, migração, exclusão real ou aprovação de política LGPD.

## Escopo verificado

| Arquivo existente | Operação real observada | Compatibilidade com novas FKs `RESTRICT` |
| --- | --- | --- |
| `app/api/admin/tenants/[id]/status/route.ts` | `PUT` atualiza `tenants.status`, grava `TenantStatusHistory` e auditoria | **Compatível por desenho**: não há hard-delete do tenant; o teste PR01 demonstra bloqueio de M2M ao suspender, preservando credencial/auditoria |
| `app/api/admin/tenants/[id]/route.ts` | Leitura GET de empresa e associações | Não apaga pai nem filho |
| `app/api/admin/allowed-users/[id]/route.ts` | `DELETE` remove somente `AllowedUser`; registra auditoria | Não remove `tenants`. Revisão não substitui os testes de autorização existentes |
| `app/api/admin/business-groups/[id]/route.ts` | `DELETE` do grupo e seus vínculos; atualiza plano do grupo | Não remove `tenants`, segundo o código consultado; exige regressão funcional do billing antes de release |
| `prisma/seed.ts` | Seed demo com `tenant.deleteMany()`, protegido por `ALLOW_DESTRUCTIVE_SEED=true` e restrição de ambiente | **Incompatibilidade esperada** se houver filhos PR01: o banco recusará apagar o tenant. Não relaxar FK; não executar fora de CI/local isolado |
| `tests/flip-ai.integration.test.ts`, `tests/stripe-top-up-webhook.integration.test.ts`, `tests/google-funnel-outbox.integration.test.ts`, `tests/google-funnel-processor.integration.test.ts` | Exclusão de tenants fictícios na limpeza de fixtures | Compatíveis quando não há registros PR01 ligados; se adicionarem integração PR01 no futuro, devem limpar apenas fixtures descartáveis em ordem de dependência, nunca registros reais |

**Limitação do inventário:** caminhos acima foram revisados especificamente, e buscas no código da `main` por exclusão de tenant não mostraram outra rota produtiva de hard-delete neste recorte. Isso **não** prova ausência de SQL indireto em scripts legados, integrações não auditadas, workers ou ferramentas externas; a avaliação de todos os processos de exclusão continua um gate.

## Comportamento testado — CI/PostgreSQL descartável

O teste `tests/pr01-closure-m2m.integration.test.ts` já utiliza `CI=true`, `127.0.0.1:5432/flipform_ci` e tenants A/B sintéticos. Adicionado ensaio que:

1. Cria credencial M2M de empresa fictícia habilitada; confirma leitura autorizada de `/api/v1/capabilities`.
2. Altera **somente** o status da empresa para `suspended`: a mesma credencial é rejeitada (403) e a credencial e a trilha de auditoria permanecem no banco.
3. Reativa **somente** a empresa fictícia e confirma que a credencial original pode autenticar novamente. Esta simulação de status não concede permissão comercial.
4. Cria outra empresa fictícia sem usuários, inscrições, leads ou filhos legados, com **apenas uma integração PR01**. A tentativa de `tenant.delete` deve falhar com `P2003` e preservar o tenant e a integração: isso impede um falso positivo por outra FK antiga.
5. Limpa exclusivamente registros sintéticos no PostgreSQL descartável. Não cria fluxo de hard-delete no aplicativo.

**Interpretação:** o teste prova a integridade desse recorte do schema e da autenticação. Não demonstra fluxo real do painel, conectores externos, envio de webhooks ou rotina completa de LGPD.

## Decisões e bloqueios que permanecem

- Dez FKs novas continuam `ON DELETE RESTRICT`. Os períodos de retenção, bases legais, minimização, acesso/expurgo e `legal hold` **não** foram aprovados; o manifest `pr01-phase9-retention-decision-matrix.json` segue inteiramente `PENDING`.
- **Proposta não aprovada:** operações regulares devem suspender integração/revogar chaves e preservar trilha necessária; tratar eventual exclusão definitiva por fluxo próprio, após política aprovada e conciliação de dependências.
- Revisar explicitamente: scripts administrativos de limpeza, impacto nos jobs existentes, acesso de suporte, desativação/encerramento de contratos, recuperação de desastre e como atender solicitações de titulares sem retenção indefinida.
- A prova de Preview `READY` no projeto `flipform-staging` não é atestado completo de identidade do banco em runtime nem de `egress`. PRs #623–#626 continuam Draft e os respectivos gates permanecem independentes.
- Atualizar o ruleset de `main` para avaliar Security/E2E/SQL em uma etapa separada de governança, sem alterar o ruleset por consequência deste documento.
- **NO-GO:** qualquer merge, `Ready for review`, deploy, migration no Neon, habilitação de `FLIPFORM_API_V1_ENABLED`, emissão de chaves reais, integração ERP, publicação de webhooks ou execuções de limpeza em dados reais. Necessária autorização específica posterior.

**Aceite da presente etapa:** verde no novo HEAD de CI, Smoke, E2E, Gitleaks/Semgrep, auditoria SQL e ensaio descartável; revisão humana do diff. Mesmo todos verdes não equivalem a aprovação de retenção nem de produção.
