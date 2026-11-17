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
