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

JEV é usado apenas quando explicitamente ativado para classificar a dúvida em uma seção existente. Condições cumulativas: SUPPORT_KB_JEV_ENABLED=true, FLIP_AI_JEV_ENABLED=true, FLIP_AI_JEV_DATA_PROCESSING_APPROVED=true e tenant permitido em FLIP_AI_JEV_TENANT_IDS. Se estiver desligado, falhar ou não encontrar capítulo, usar busca local.

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
