# Suporte — conhecimento interno por empresa (PR #614)

**Estado:** DRAFT. Sem autorização para merge, deploy, migration, credenciais ou dados reais. Configurações desligadas por padrão.

## Arquitetura vigente deste PR

**O GitHub não é a base de conhecimento em runtime.** O arquivo no repositório é apenas um exemplo para revisão e futuro upload. Cada tenant envia seu próprio arquivo .md em Configurações → Suporte — Manual da empresa. O arquivo privado fica no R2 e só pode ser recuperado pelo tenant da sessão verificada. Não se recupera Markdown do repositório como fallback.

- Owner/Admin: anexar arquivo .md (até 1 MB) e atualizar sua versão pelo painel; controle de versão, SHA-256, manifesto privado e auditoria.
- Owner/Admin/Manager/Agent: consultar o próprio manual pelo botão **Suporte** (ícone LifeBuoy laranja) dentro do Inbox e do Direct, ou pela tela interna completa.
- Viewer: acesso negado. Nenhum membro pode escolher o tenant por nome, slug ou ID no request: o servidor obtém ID de sessão.
- Arquivo não enviado ou armazenamento indisponível: resposta controlada de indisponibilidade; não inventar respostas e não mostrar conteúdo de outra empresa.
- Sem mudanças em IA de conversas com clientes, Markdown Mestre do Flip AI, CRM, leads, Ads/Pixel, WhatsApp ou Stripe.

## Busca sem IA e JEV opcional

A pesquisa lexical funciona sem IA: normaliza texto, localiza capítulos e extrai trechos diretamente do Markdown aprovado. A resposta exibe título do capítulo para conferência do atendente.

JEV é usado apenas quando explicitamente ativado para classificar a dúvida em uma seção existente. Condições cumulativas: SUPPORT_KB_JEV_ENABLED=true, FLIP_AI_JEV_DATA_PROCESSING_APPROVED=true e tenant permitido na allowlist separada SUPPORT_KB_JEV_TENANT_IDS. A flag FLIP_AI_JEV_ENABLED (resposta ao cliente) NÃO é alterada para usar o Suporte. Se estiver desligado, falhar ou não encontrar capítulo, usar busca local.

JEV não cria conhecimento, não consulta a internet, não redige respostas jurídicas e não recebe automaticamente conversa, documentos ou dados pessoais do cliente. Só a pergunta curta minimizada e títulos de seções são candidatos a serem enviados, após aprovação de privacidade. Nenhuma resposta é enviada automaticamente ao lead.

## Configuração e armazenamento

- SUPPORT_KB_GLOBAL_ENABLED=false por padrão. Sem ativação, nem botão nem API de consulta funcionam.
- Reutiliza bucket R2 privado do FlipForm (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ATTACHMENTS_BUCKET).
- Prefixos independentes por tenant, versões imutáveis e manifesto por empresa. AuditLog registra troca de revisão.
- Sem migração no banco; não executar qualquer operação em produção neste PR.
- O manual Junqueira em docs/suporte-atendimento/JUNQUEIRA-BASE-DE-CONHECIMENTO.md é material de preparação a ser **anexado no painel** após homologação, não fonte automática do sistema.

## Conteúdo do piloto Junqueira

O manual registra Previdenciário, Consumidor, roteiro de campo Trabalhista dos 13 prints, fluxo do atendimento, perguntas, documentos, fontes e alertas. As informações oficiais de telefone, WhatsApp, e-mail, horário geral, sete unidades, endereços, contatos e equipe foram extraídas em 17/11/2026 de:
- https://junqueiraadvogados.com/
- https://junqueiraadvogados.com/contato
- https://junqueiraadvogados.com/unidades
- https://junqueiraadvogados.com/equipe
- https://junqueiraadvogados.com/escritorio
- https://junqueiraadvogados.com/areas-de-atuacao

Não tratar como informação confirmada: honorários, SLA interno, responsável pela distribuição, roteiro aprovado de assinatura/contrato, agenda da unidade e documentação obrigatória por fase. O site atual indica 15+ anos e página antiga indica 8 anos; texto de experiência exige revisão. O contato de Araioses publicado como (98) 7006-0896 requer confirmação operacional.

**Atenção:** os prints antigos listam “Senha GOV” como obrigatória, mas é proibido exigir ou guardar senha ou código de autenticação de clientes. As promessas de resultado/prazo e práticas de captação e indicação precisam passar por revisão jurídica e ética antes de serem publicadas como script operacional.

## Gates pendentes para ativação

- [ ] CI, Smoke, E2E, Semgrep e Gitleaks verdes no HEAD final. O finding histórico do Gitleaks foi inspecionado no SARIF: .env.example linha 118 em commit 27914249, com **nomes de variáveis** R2 em comentário, sem valores. O arquivo .gitleaksignore registra um **único fingerprint** justificado; não desabilita regras e precisa ser confirmado no novo check.
- [ ] Revisar persistência no R2, isolamento entre tenants, permissões, versões, logs, rollback, concorrência, privacidade e uploads inválidos.
- [ ] Resolver **falta de compare-and-swap atômico** do manifesto R2 em uploads simultâneos; pode ocorrer perda de atualização na versão atual.
- [ ] Testar com identidades fictícias de duas empresas e diferentes papéis, sem ler dados de produção.
- [ ] Aprovar o conteúdo juridicamente, políticas internas e práticas de contato/captação.
- [ ] Validar gastos e aprovação de tratamento de dados antes de habilitar JEV.
- [ ] Obter autorização humana específica para merge, deploy e ativação das flags.

**Não fazer merge nem deploy automaticamente.**


## PR corretivo: erro 404 e política de acesso (17/11/2026)

**Problema confirmado:** a rota `/settings/suporte-atendimento` executava `notFound()` quando a variável `SUPPORT_KB_GLOBAL_ENABLED` estava ausente ou desligada. O card em Configurações e os endpoints de consulta também estavam condicionados à mesma flag, embora o código estivesse em produção após o PR #614.

**Correção:** a interface e o endpoint de configuração passam a estar disponíveis ao **Proprietário (owner)** sem feature flag, com sessão verificada e controle de tenant. O armazenamento real continua exigindo configuração válida de R2, hash e versões, e o sistema informa erro de configuração em vez de fingir que salvou um manual.

**RBAC obrigatório:**

- `owner`: gerencia e baixa a revisão do próprio tenant pela API de Configurações; **não** tem acesso ao botão operacional do atendente.
- `agent`: encontra o botão **Suporte** no Inbox/Direct, pesquisa e visualiza apenas o Markdown da empresa associada à sessão; **não** edita nem faz upload.
- `admin`, `manager` e `viewer`: não gerenciam nem consultam o Suporte na versão atual.
- `developer`: **não é papel existente no RBAC**. Não habilitar por aproximação a `platform_admin` ou `admin`; futura autorização técnica deve ter regra própria, auditabilidade e revisão da política de acesso entre tenants.

**Edição segura:** o editor e o download do manual fazem `GET /api/suporte-atendimento/config?includeContent=1` autenticado como Proprietário, e não utilizam o endpoint operacional do Atendente. Nenhum endpoint aceita `tenantId` do navegador para escolher outra empresa.

**Plano Inbox:** `/settings/suporte-atendimento` e `/suporte-atendimento` são explicitamente permitidos; a configuração tem link independente no menu para o Proprietário. Outras Configurações continuam bloqueadas no Plano Inbox.

**Estado sem arquivo:** o Atendente verá uma mensagem orientando o Proprietário a cadastrar o manual, não um 404 sem explicação.

**Gates:** CI, Playwright, Semgrep e Gitleaks devem passar no HEAD do PR corretivo; validação de upload real e isolamento no R2 somente com autorização específica e preferencialmente com dados fictícios. **Sem merge/deploy/alteração de produção nesta revisão.**


## Atualização — liga/desliga do Suporte por empresa (17/11/2026)

O **Suporte vem DESLIGADO de fábrica** para todos os tenants, incluindo os que já anexaram Markdown antes desta versão. A configuração `Configurações → Suporte` permanece visível para o Proprietário independentemente de o recurso estar ligado ou não.

- O Proprietário tem um **switch liga/desliga**. A ativação só é aceita quando há um Markdown válido já publicado para **a empresa atual**. O estado é salvo em `tenants/<tenantId>/support-knowledge/activation.json` no mesmo R2 privado, separado do manifesto do manual, com revisão e auditoria. Sem arquivo de ativação = `enabled:false`.
- Ao **ligar**, apenas o perfil **Atendente (agent)** recebe botão Suporte, tela de consulta e acesso às APIs de leitura/pergunta; todas verificam o estado privado do próprio tenant.
- Ao **desligar**, o botão some e as APIs negam acesso ao manual e às respostas (mesmo por URL direta); o documento **não é apagado** e pode continuar a ser editado pelo Proprietário.
- Nenhuma flag global, alteração de variáveis Vercel ou migration para liberar o switch. Não altera IA/JEV, Ads, leads, conversas, Stripe ou permissões de outros módulos.
- Estado de ativação ausente, inválido ou inacessível = **desligado (fail closed)**. O GET do Proprietário denuncia armazenamento indisponível sem fingir que um upload ou switch foi salvo.
- O switch usa `PATCH /api/suporte-atendimento/config` com verificação de sessão, papel `owner`, revisão esperada e `tenantId` somente do servidor; registra evento de ativação/desativação no AuditLog.

**Limite técnico conhecido:** o objeto de ativação usa verificação otimista de revisão, porém o R2 não oferece CAS atômico neste fluxo. Duas alterações concorrentes, em sessões diferentes do Proprietário, podem competir; revisar transações/serialização antes de usar essa funcionalidade em cenários multiadministrador. Na política atual só `owner` administra.

**Liberação:** homologar testes de papéis, OFF inicial, ON com manual, OFF mantendo manual, tenant B independente, falha R2, refresh de página e APIs negadas antes do merge e deploy. **Não publicar ou alterar produção automaticamente.**
