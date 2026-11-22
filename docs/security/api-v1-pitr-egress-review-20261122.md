# API v1 / PR629 — recuperação PITR e isolamento de saída (22/11/2026)

**Decisão: NO_GO para publicação. Evidências de leitura/diagnóstico, não autorização.**

## 1. Recuperação do banco: o que foi demonstrado

- Projeto Neon exclusivo para staging: `holy-fog-36254823` / `flipform-staging-isolated`, com **histórico de 86.400 segundos (24 horas)** conforme configuração consultada.
- O laboratório com 102 tabelas e fixtures A/B é uma **branch filha** `br-snowy-band-bcb0auy6` de `br-rough-bread-bc1ulrnc`. Seu clone de recuperação `br-curly-smoke-bck076qv` apresentou 102 tabelas, 30 índices API, 10 FKs `RESTRICT` e os mesmos contadores de dados sintéticos. Isso é **clone consistente**, não restauração PITR.
- Neon confirma em sua documentação que **instant restore/PITR se aplica à branch raiz, não à branch filha**; a URL documental verificada é `https://neon.com/docs/postgres/backup-restore/branch-restore`. A branch padrão `staging` (`br-icy-glitter-bcisq63l`) não possui o schema da aplicação, portanto um PITR nela não comprovaria recuperação da API atual.
- Inventário de snapshots: três snapshots manuais de 17/11, **todos da branch raiz padrão**, anterior ao laboratório de API. Não existem snapshots da branch QA atual; tentativa prévia de criar snapshot de branch filha foi rejeitada.
- Tentativa não destrutiva de preparo de **backup lógico** em sandbox Vercel isolado, sem credenciais de produção: ambiente Ubuntu não disponibilizava `pg_dump`, `pg_restore` ou `psql`; instalação via `apt-get` falhou por rede (repositórios de pacotes indisponíveis, inclusive com HTTPS). **Nenhum arquivo de backup foi gerado; nenhuma restauração lógica foi executada**. Sandbox `sbx_SNGUD7zWcUvOYkZBGuB83XRjdUhi` encerrado.
- O teste real de backup/restauração da API, métricas RPO/RTO, integridade de linhas e aplicação reconfigurada com o banco restaurado **permanecem pendentes**. Não afirmar aprovação do gate.

## 2. Egress: inventário e riscos residuais

Leitura do projeto **Vercel staging**, sem descriptografar segredos:
- Overrides específicos de `security/api-v1-homologation-20261121`: `DATABASE_URL`, `DIRECT_URL` (sensitive), `FLIPFORM_API_V1_ENABLED` (retornada a false) e `MAINTENANCE_GATE` (disabled).
- Variáveis **compartilhadas pelos targets `production` e `preview` do projeto staging**: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET_CURRENT` e `JWT_SECRET_PREVIOUS` (sensitive). Seus **valores não foram lidos ou comparados** com a Vercel produção. Não afirmar isolamento de segredos só pelo nome do projeto. O override de DB vale apenas para a branch PR629, não necessariamente para outros previews.
- Projeto `flipform-staging` possui proteção de preview por autenticação Vercel/SSO. Segurança de entrada **não equivale** a bloqueio de saída/egress da função.
- O `vercel.json` do commit `ef1ae355281b607f7acaca4688d50c79622f6c45` não declara `crons`. Existem entretanto quatro handlers `app/api/cron/*`: `billing-status`, `billing-suspension`, `chat-attachments`, `google-conversions`. Os handlers consultados usam `isCronRequestAuthorized`, que nega requisições quando `CRON_SECRET` está ausente. **Ausência de cron no vercel.json não comprova ausência de invocação externa/manual ou de outros schedulers.**
- Há **módulos com transporte externo real fora da API v1**: `lib/tracking/meta-capi.ts` contém `fetch(`; `lib/tracking/google-funnel-processor.ts` prepara entrega via `google-data-manager`; rotas `app/api/webhooks/meta/whatsapp`, `app/api/webhooks/stripe`, `app/api/integrations/meta-delivery/replay` permanecem no mesmo projeto Next.js. Não foram acionados durante auditoria.
- Revisadas oito rotas `app/api/v1/**/route.ts` e seus módulos M2M de leitura no commit aprovado; nenhuma chamada HTTP externa direta foi encontrada **nesse subconjunto**. Sem captura de egress da aplicação completa, isso **não autoriza marcar** `staging_egress_isolation_attested=true`.
- Nenhuma chave real da Meta, Google, Stripe, WhatsApp ou campanhas foi manipulada. **Não ativar** jobs, envs externos, Ads, Pixel ou workflows de manutenção para testar.

## 3. Aceite futuro verificável

1. Preparar **ambiente de recuperação totalmente descartável** com schema da API e cliente `pg_dump/pg_restore` previamente disponível, conexão mínima ao Neon QA, gerar backup e restaurar **em banco separado**, comparar schema e conteúdo sintético, medir RTO e testar conexão read-only do app restaurado; ou executar PITR de **branch raiz descartável com schema da API**, nunca PITR que substitua staging padrão/prod.
2. Validar egress com **medição de tráfego/destinos do runtime** e lista de allowlist por ambiente, verificar que `preview` não herda credenciais ativas de terceiros e que todas as rotas jobs/webhooks aplicam seus gates.
3. Confirmar que a branch final do PR629 mantém `FLIPFORM_API_V1_ENABLED=false`, as chaves A/B estão revogadas e nenhuma integração QA ativa; este estado já foi demonstrado no teste anterior, não significa liberação produtiva.
4. Revisar a política de retenção das dez categorias no workbook, com responsáveis e aprovação formal. Só depois reavaliar rollout e rollback de produção, em decisão explícita.

**Estado resumido:** clonagem QA PASS; PITR/backup com schema API NOT_PROVEN; egress de rotas API v1 sem envio direto observado, egress geral de staging NOT_ATTESTED; política LGPD PENDING; produção NO_GO.
