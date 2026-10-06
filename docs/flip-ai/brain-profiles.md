# Qualificação por perfil no cérebro publicado

O Markdown Mestre contém conteúdo institucional, operação, orientações e os perfis de triagem. O runtime lê as configurações somente da revisão ligada ao índice publicado do agente, com tenant e agente resolvidos pelo servidor. Salvar um rascunho não muda uma conversa publicada.

## Contrato

Inclua exatamente um bloco `flip-ai-profiles` com JSON. `version` é 1. Há no máximo 30 perfis. Cada perfil tem ID único, nome, descrição curta para roteamento, termos para busca e de 1 a 8 critérios. Os pesos dos critérios somam 100. Cada critério tem exatamente cinco níveis, do menos aderente (0) ao mais aderente (4). Descrições e níveis aceitam até 240 caracteres. Não inclua números de documentos, credenciais ou dados de leads nessa configuração.

O exemplo `junqueira-profiles.example.md` demonstra todos os assuntos pedidos. Ele é um rascunho de configuração técnica: o escritório deve revisar as descrições, critérios e pesos dentro de seu próprio cérebro. Os exemplos não estabelecem requisitos legais nem confirmam direitos. Nada neste PR publica ou modifica um cérebro de cliente.

## Execução

1. Com Jev habilitado para o tenant, o runtime carrega o catálogo compacto da revisão publicada.
2. Uma decisão `choice` identifica o assunto entre os perfis daquela empresa e `unknown`. A campanha é uma pista; o relato da pessoa determina o tema. Ambiguidade mantém o tema desconhecido.
3. A chamada de decisão existente recebe somente os critérios do perfil identificado. Cada critério usa `choice`, com `unknown` e os cinco níveis definidos no Markdown.
4. O código calcula `soma(peso × nível / 4)`, arredondada entre 0 e 100. A nota não é escrita livremente pela OpenAI.
5. Confiança inferior a 0,60 no assunto ou em um critério mantém a análise incompleta. Ausência de informação não equivale a incompatibilidade. A interface mostra uma nota somente quando todos os critérios puderem ser avaliados.
6. Na indexação, o bloco é transformado em seções separadas por perfil, evitando misturar teses em um fragmento JSON. A revisão original permanece intacta. A busca do harness inclui nome e termos do perfil. Continuam valendo os limites de histórico e seleção de fragmentos existentes.
7. O CRM reutiliza a análise armazenada. O resumo inclui fatos e pendências da memória compacta da conversa; o painel mostra as interpretações de cada critério e seu peso.

O score é uma régua de triagem, não probabilidade de fechamento, direito confirmado ou diagnóstico. Classificação sugerida, somente com análise completa: 75 ou mais = qualificado; 25 ou menos = não qualificado; demais = nutrição. Incompleta = informação insuficiente. A temperatura operacional continua sob controle humano.

A qualificação final é alinhada à rubrica antes da persistência e no replay. Enquanto incompleta, nenhuma qualificação final com nota numérica é gravada; o humano continua recebendo a memória e pendências. A API mantém score null e temperatura unknown, com prioridade normal de encaminhamento na ausência de outro sinal de prioridade alta. O campo legado `fitScore` recebe a nota agregada do perfil para compatibilidade; o painel principal identifica a política `brain-profile-v1`. A nova análise não altera etapa, responsável nem temperatura do Lead.

## Compatibilidade e custo

Sem o bloco, mantém-se a política genérica atual. Configuração inválida é recusada no salvamento. Uma configuração inválida legada não gera nota de perfil. Sem Jev configurado/habilitado, a conversa segue seu fallback existente, sem fingir uma classificação Jev.

O roteamento acrescenta uma chamada curta antes da avaliação. Entrada e saída das duas chamadas são somadas no evento de uso existente. O resultado e a revisão utilizada são persistidos junto com a decisão, preservando o replay sem chamada adicional. Timeout/erro mantém a política existente de não repetir uma chamada ambígua.

A economia líquida deve ser medida em conversas reais: o catálogo compacto e a rubrica selecionada adicionam custo, enquanto a busca dirigida evita enviar conteúdo de outras teses à OpenAI. Não há garantia de economia apenas por habilitar Jev.

## Ativação e escopo

Após merge manual, editar o Markdown do agente, revisar perfis, salvar, indexar e publicar pelos fluxos existentes. A conta TypeSafe usa `TYPESAFE_API_KEY`, `TYPESAFE_JEV_MODEL`, `FLIP_AI_JEV_ENABLED`, a allowlist `FLIP_AI_JEV_TENANT_IDS` e a aprovação `FLIP_AI_JEV_DATA_PROCESSING_APPROVED`. A chave fica apenas no backend. A aprovação permanece falsa até a revisão formal de retenção e Zero Data Retention descrita em `JEV-PRIVACY-RUNBOOK.md`.

Sem migration. Sem instalação local do modelo, agenda externa ou alteração de integrações Meta/WhatsApp. As capacidades de ação continuam obedecendo às permissões existentes do agente.

Referência de contrato HTTP consultada: https://docs.typesafe.ai/api. Testes usam respostas simuladas do provider; a ativação requer validação real de chave, respostas, latência e custo no tenant piloto.
