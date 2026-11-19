# PR00 P0 — Inventário de origem de links legados de formulário

**Data:** 19/11/2026 | **Escopo:** auditoria somente de arquivos GitHub (`main` e branch Draft #624).  
**Status:** inventário técnico de emissores conhecido; **inventário dos links publicados e proprietários históricos NÃO comprovado**.  
**Sem acesso:** Neon/CRM produtivos, leads, dados pessoais, Meta Ads, Google Ads, WhatsApp, listas de clientes ou URLs privadas de campanha. Sem merge/deploy.

## Achados reproduzíveis no código principal (`main`)

| Fonte / linha em `main` | Emissão ou referência antiga | Consequência e situação no PR #624 |
|---|---|---|
| `lib/forms/public-form-url.ts:21` | Fallback `https://{appDomain}/f/{slug}` | A listagem antiga podia fornecer um link só por slug; a listagem do PR #624 já passa `formId` e emite URL canônica. O helper ainda contém um fallback quando `formId` não é informado: **ponto residual para revisão**, não autorização de release |
| `app/api/forms/route.ts:34` | Chamava `buildPublicFormUrlState` sem UUID | PR #624 já passa `formId: form.id`; novos links emitidos na listagem deixam de depender de identidade por slug |
| `lib/dashboard-metrics.ts:679` | `publicUrl: /f/{form.slug}` no Dashboard | PR #624 já substitui por `/f/id/{form.id}/{form.slug}`; teste estático impede regressão |
| `app/(app)/forms/page.tsx:169` | Fallback para `/f/{f.slug}` no botão de abrir | PR #624 já usa ID imutável no fallback |
| `prisma/seed.ts:207` | Console de dados de **demonstração** mostrava `/f/{form.slug}` | Corrigido nesta rodada na branch Draft para `/f/id/{form.id}/{form.slug}`; seed não comprova campanha publicada |
| `docs/operations/custom-form-domains.md:24` | Guia de domínio mencionava `/f/{slug}` | Atualizado na branch Draft para distinguir novos links canônicos de aliases históricos pendentes |
| `docs/operations/lead-attribution.md:42` | Exemplo de UTM/Meta/Facebook no formato `/f/SLUG?...` | Atualizado na branch Draft para `/f/id/FORM_UUID/SLUG?...`; é **exemplo**, não anúncio real comprovado |
| `tests/test_custom_form_domains_static.py:31,183` | Asserções antigas cobriam emissão por slug | Asserções do PR #624 já cobrem links por ID na tela; o teste de fallback do helper permanece como possível ponto de geração, sob revisão |
| `docs/operations/meta-capi.md:60` | Documentação genérica cita `/f/[slug]` | Referência descritiva, não prova de publicidade ativa, nem permissão para mudar Pixel/CAPI |

**Evidência histórica de código não equivale a titularidade comercial.** Não foi possível obter do repositório quais URLs foram efetivamente compartilhadas, quem recebeu cada URL, qual tenant era proprietário no momento de publicação, ou se um slug foi renomeado, desativado ou reutilizado.

## Matriz de coleta para futura homologação comercial

Preencher **somente após autorização específica para inventariar metadados, com privilégio mínimo, e sem expor PII**. Não executar SQL produtivo como parte deste documento.

| Item de URL / canal | Host e caminho histórico | Tenant dono comprovado (ID) | Form ID imutável | Prova de propriedade (referência) | Tipo de vínculo | Ação antes de release |
|---|---|---|---|---|---|---|
| Exemplo didático — NÃO PUBLICAR | `app.flipform.com.br/f/exemplo` | PENDENTE | PENDENTE | PENDENTE | Sem evidência | Bloquear, não criar alias |
| Formulários anteriormente enviados | PENDENTE | PENDENTE | PENDENTE | PENDENTE | A avaliar | Levantar metadados aprovados |
| Campanhas Meta/Google e links Site | PENDENTE | PENDENTE | PENDENTE | PENDENTE | A avaliar | Conferência somente leitura e auditada |
| WhatsApp, QR, bio, materiais impressos | PENDENTE | PENDENTE | PENDENTE | PENDENTE | A avaliar | Confirmar com responsável por canal |
| Domínios personalizados verificados | PENDENTE | PENDENTE | PENDENTE | PENDENTE | Host pertence ao tenant | Confirmar vínculos e SSL |

**Não inserir telefone, nome de lead, mensagens, cookie, token, chave, DSN ou URL com parâmetros de identificação pessoal no inventário.** Apenas identificadores de empresa/formulário, URL *sem dados pessoais* e referência de aprovação.

## Decisão técnica de compatibilidade — branch Draft #624

1. **Novo link do domínio da plataforma:** `/f/id/{formId}/{slug}`; o ID imutável identifica o formulário. Preserva UTMs na query string durante navegação normal.
2. **Link antigo do domínio da plataforma:** `/f/{slug}` só pode resolver por mapeamento explícito `slug -> formId + tenantId + evidenceRef` em `PR00_VERIFIED_LEGACY_FORM_ALIASES_JSON`. Não aceitar seleção por "primeiro resultado", ordem do banco, ou slug ativo único.
3. **Domínio personalizado:** permanece restrito ao host verificado e tenant associado, com bloqueio se SSL/status não estiver ativo.
4. **Sem manifesto aprovado:** links antigos do domínio plataforma retornarão 404. Esse comportamento é intencionalmente seguro, mas **não deve ser implantado sem concluir a compatibilidade comercial**, pois poderia interromper captação.
5. **Um responsável único:** a aprovação documental feita pelo próprio proprietário não deve ser apresentada como segunda aprovação independente. Registrar riscos e obter revisão externa quando possível.

## Critérios pendentes para decidir merge/deploy

- [ ] Inventário de URLs reais publicadas (sem PII), incluindo links antigos, formulários renomeados/desativados e reutilização histórica de slugs.
- [ ] Cada alias aprovado com comprovação do tenant e form ID. Slugs ambíguos ou sem evidência permanecem bloqueados, com plano comercial de substituição.
- [ ] Regressão HTTP GET/POST e rastreamento de UTMs/consentimento/Meta-GTM usando **somente dados e provedores fictícios**, sem eventos reais.
- [ ] Ensaios de rollback, CI/Playwright e revisão do último commit.
- [ ] Autorização individual e explícita antes de qualquer alteração em Vercel Production, Ads/Pixel, configuração de aliases, merges ou deploys.
- [ ] PR #623 de manutenção e os quatro workflows reparadores permanecem separados; `MAINTENANCE_GATE=disabled`; PR #625 de concorrência também segue Draft.

**Conclusão:** o inventário de emissores de links no código está documentado, mas a prova de propriedade histórica é um gate **ABERTO**. **Não** preencher aliases reais por inferência a partir de código, slug corrente, seed ou documentos ilustrativos. 
