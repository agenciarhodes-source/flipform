# Suporte de Atendimento (piloto Junqueira) — implantação controlada

## Escopo deste PR

Nova tela de consulta **somente leitura** em /suporte-atendimento, com pesquisa textual no navegador e índice de seções, alimentada exclusivamente pelo arquivo versionado JUNQUEIRA-BASE-DE-CONHECIMENTO.md.

A base é distinta do Markdown Mestre/índice do Flip AI. **Nenhuma chamada a OpenAI, TypeSafe/Jev, banco de dados, canais de mensagem ou serviços externos é feita pela consulta do conteúdo.** Não usa dados reais do CRM, não muda Kanban, leads, carteiras, contratos ou permissões gerais.

## Acesso e isolamento

- **Fail closed**: sem SUPPORT_KB_JUNQUEIRA_TENANT_ID configurado, não é possível consultar e o link fica oculto.
- Configurar em ambiente autorizado apenas depois de identificar e validar o **ID real do tenant Junqueira Advogados**, sem usar slug ou nome editável.
- Exige sessão verificada e correspondência exata do tenant; perfis autorizados: owner, admin, manager, agent. Viewer fica de fora.
- Link visível na seção Atendimento da navegação somente ao tenant/papel autorizado e com associação ativa ao tenant.
- Mesmo conhecendo a URL, usuários de outros tenants recebem 404. A rota permanece dentro do layout autenticado e das verificações de cobrança já existentes.
- Documento armazenado no **repositório privado**. Não enviar esse arquivo para diretório public nem publicar como página de SEO.
- **Não** colocar o identificador real do tenant em commits, comentários ou screenshots; configurar somente no ambiente de execução após aprovação.

## Passos de homologação e ativação (NÃO executar automaticamente)

1. Responsável jurídico aprova texto e atualizações legais, especialmente maternidade, BPC, aposentadoria, direitos do consumidor e normas da OAB.
2. Operação do escritório preenche todos os campos [PREENCHER]/[VALIDAR], critérios de aceite e documentação por fase, mensagens e contratos aprovados.
3. Segurança revisa a política de acesso e confirma o ID do tenant no ambiente autorizado, sem abrir dados reais ou alterar credenciais neste PR.
4. Validar CI (npm ci, prisma generate/validate, typecheck, build) e testes de acesso; em build standalone/serverless confirmar arquivo .md presente no bundle.
5. Validar com identidades de teste: agente Junqueira pode ler; owner/admin/manager podem ler; viewer, usuário sem sessão e outro tenant não podem; sem env ninguém acessa. Checar busca, páginas vazias, temas de documentos, layouts móveis.
6. Somente após aprovação específica e merge manual, configurar SUPPORT_KB_JUNQUEIRA_TENANT_ID no ambiente autorizado com ID validado e realizar o processo usual de implantação.
7. Publicar o conteúdo ao time após homologação jurídica e treinamento. Uma atualização do MD exige novo PR e revisão do conteúdo.

## Atualização do manual

- Caminho único: docs/suporte-atendimento/JUNQUEIRA-BASE-DE-CONHECIMENTO.md.
- Evitar PII ou qualquer material de casos reais no repositório.
- Revisões devem registrar data, responsável e referência oficial.
- Não alterar Markdown Mestre do Flip AI nem indexar o manual automaticamente para a IA externa.
- Qualquer futura edição pelo próprio painel, upload por gestor ou suporte para múltiplos tenants será **outra proposta**, exigindo autenticação, trilha de auditoria e armazenamento isolado por tenant.

## Limites conhecidos

- Primeira versão oferece **pesquisa textual**, não um chatbot gerador de respostas.
- O conteúdo é um rascunho inicial com campos institucionais e procedimentos que dependem do escritório.
- Ainda **não** é configurável/editar pelo painel; mudanças dependem de revisão/PR do arquivo MD.
- A página fica deliberadamente invisível/inacessível até ativação explícita.
- Sem migrações, sem mudança de cobrança e sem publicação automática.


## Revisão da experiência — painel lateral Dúvidas (17/11/2026)

- A consulta também está disponível como **balão flutuante "Dúvidas"** em Inbox e Direct para o tenant piloto autorizado (sem entrar na tela separada).
- Abre painel lateral inspirado em suporte contextual e mantém a conversa atrás, sem envio automático ao cliente.
- O funcionário escreve uma pergunta e recebe **trechos recuperados do Markdown**, com título da seção como fonte.
- A recuperação atual é **extrativa, local e determinística**: não há geração de novo parecer ou ligação com JEV, OpenAI ou dados da conversa do cliente. Se não encontra fonte suficientemente próxima, informa indisponibilidade e remete à supervisão.
- Link do manual no menu permanece como alternativa de leitura integral.
- A API privada do manual verifica sessão atual, permissionamento e o ID exato de tenant antes de ler/devolver o MD. Arquivo versionado e cache no-store.
- Corrigido o teste visual que falhou no CI inicial: link sublinhado na linha 40 do componente de leitura, detectado por tests/test_action_links_as_buttons_static.py. Revalidar a CI no **HEAD atual** do PR.

### Configuração global solicitada — pendente de implementação

O desejo de anexar/atualizar MD **pelo painel do tenant** e usar JEV para roteamento semântico foi documentado, mas **não faz parte das funcionalidades operacionais deste PR ainda**. A próxima implementação deve:
1. Criar configuração global de produto com documentos **isolados por tenant**, revisão imutável, hash, auditoria e revisão/aprovação antes da publicação.
2. Oferecer upload de .md com validação de tamanho, MIME, formato, idempotência e permissões (owner/admin), além de rollback.
3. Entregar acesso somente-leitura a atendentes autorizados e observabilidade de decisões, custo e falhas.
4. JEV opcional somente após revisão formal de privacidade/retention e aprovação do tenant. Pergunta mínima redigida, sem conversa do cliente nem documentos; JEV escolhe classificação/seção, recuperação no servidor usa apenas conteúdo aprovado, fallback local sem IA.
5. Nunca compartilhar conteúdo entre empresas, nunca atualizar automaticamente o cérebro do Flip AI, nunca mover lead ou enviar mensagem ao cliente.

**Referência para complementar o manual:** https://junqueira-campo.netlify.app/trabalhista . URL fornecida pelo usuário, porém a extração automática não foi possível: não afirmar que os roteiros dessa página foram importados. Se houver exportação HTML/PDF/MD do manual, revisar e incorporar em PR posterior com controle de origem.
