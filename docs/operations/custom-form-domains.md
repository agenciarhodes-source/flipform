# Domínios de Formulário

## Objetivo
Permitir que tenants publiquem formulários públicos do FlipForm em subdomínios próprios, como `leads.suaempresa.com.br`, sem mover login, dashboard, Kanban, billing, integrações ou admin para esse domínio.

## Plataforma vs. formulário
- Plataforma FlipForm: continua em `app.flipform.com.br`.
- Domínio personalizado: serve apenas formulários públicos e 404 pública.
- Rotas internas acessadas por um domínio de formulário são reescritas para a área pública de custom domain, não para o painel.

## Envs necessárias
Configure na Vercel/produção:
- `VERCEL_TOKEN` — token server-side da API da Vercel. Nunca expor no frontend.
- `VERCEL_PROJECT_ID` — projeto FlipForm que recebe os domínios.
- `VERCEL_TEAM_ID` — time Vercel, quando aplicável.
- `NEXT_PUBLIC_APP_DOMAIN` — domínio da plataforma, ex.: `app.flipform.com.br`.

Se `VERCEL_TOKEN`/`VERCEL_PROJECT_ID` não estiverem configurados, o painel permite cadastrar domínios em modo manual e exibe aviso de integração automática indisponível.

## Fluxo DNS
1. Cliente escolhe um subdomínio, exemplo `leads.suaempresa.com.br`.
2. Cliente cadastra em **Domínios de Formulário**.
3. FlipForm tenta adicionar o domínio ao projeto Vercel.
4. O painel exibe registros TXT/CNAME retornados pela Vercel quando disponíveis.
5. Cliente configura DNS no provedor.
6. Cliente clica em **Verificar agora**.
7. Após `verification_status=verified`, rotas vinculadas passam a responder.

## Como testar
1. Criar ou usar um formulário ativo.
2. Acessar `/domains` como owner/admin/manager.
3. Cadastrar um subdomínio.
4. Confirmar instruções DNS ou aviso de modo manual.
5. Verificar o domínio.
6. Vincular o formulário à rota `/` ou `/campanha-x`.
7. Acessar `https://subdominio/campanha-x`.
8. Submeter o formulário e confirmar lead, pipeline/etapa inicial e tracking Meta/CAPI existentes.
9. Tentar `https://subdominio/dashboard` e confirmar que o dashboard não abre.
10. Confirmar que `/f/[slug]` no domínio da plataforma segue funcionando.

## Checklist pós-deploy
- [ ] Vercel Production READY.
- [ ] Rodar `prisma migrate deploy`.
- [ ] Rodar `npm run admin:repair-schema` se necessário.
- [ ] Rodar `npm run admin:diagnose-schema`.
- [ ] Conferir envs `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `NEXT_PUBLIC_APP_DOMAIN`.
- [ ] Cadastrar e verificar um domínio real.
- [ ] Testar formulário por raiz e path.
- [ ] Conferir logs da Vercel e audit logs do tenant.

## Meta Ads
O Pixel continua sendo por tenant, configurado em Integrações. Não há Pixel por domínio ou por formulário neste PR. Para campanhas da Meta, recomenda-se verificar também o domínio no Business Manager e associar eventos ao Pixel existente.

## Limitações
- Remoção de domínio na Vercel não é automática; exclusão no painel remove o vínculo no FlipForm e a remoção externa deve ser operacional/manual quando necessária.
- A verificação depende dos dados retornados pela Vercel; o painel não inventa destinos DNS quando a API não retorna instrução.
