# Ficha GoJus — preparação do Anexo 1

Estado: **não validado**. O Plano v1.1 exige o manual preenchido a partir da gravação da atendente antes da implementação funcional do PR 03. Esta preparação não expõe dados, não cria rotas, não altera banco e não cria permissões nem libera recursos.

## Inventário de fontes candidatas (não é a ordem das telas GoJus)

| Informação | Fonte candidata | Situação |
|---|---|---|
| Nome completo | Lead.name | Confirmada no schema |
| CPF | leadCpfSummary / revealLeadCpf (lead_cpf) | Serviço existente; revelar somente por ação de quem pode editar o lead, com auditoria |
| Telefone | Lead.phone | Confirmada no schema, opcional |
| E-mail | Lead.email | Confirmada no schema, opcional |
| Endereço | A definir (não há endereço completo em Lead) | Pendente; cidade e estado não bastam |
| Área/tese | ConversationDocumentCase e DocumentChecklist | Conversão dos nomes para GoJus a definir |
| Etapa | Lead.stage | Confirmada no schema; confirmar se GoJus exige |
| Responsável | Lead.assignedUser | Definir se o GoJus espera atendente ou advogado |
| Data da assinatura | Fonte a definir e confirmar | Data de recebimento não equivale a data da assinatura |
| Observações | Resumo sanitizado e revisão humana | Pendente; não copiar conteúdo sensível bruto |
| Anexos | signedClosingReview, lead_documents, rotas privadas existentes | Confirmar tipos e limites no GoJus |

## Como gravar

Use ambiente de teste e dados fictícios autorizados, sem senhas, CPF real, tokens ou dados pessoais de clientes. Não grave a digitação de credenciais. Grave dois ou três cenários de cadastro e uma consulta de andamento, inclusive telas de confirmação. Mostre:

1. Tela inicial após login (identificar título e URL sem dados de sessão).
2. Como localizar cliente existente e como cadastrar um novo.
3. Campos do cliente, ordem, obrigatoriedade, opções e validações.
4. Cadastro de caso/processo, área, responsável e demais campos.
5. Anexar documentos, limites e evidência de sucesso.
6. Salvar em ambiente de teste e localizar identificador do GoJus.
7. Consulta de andamento, nomes das fases e mensagens de erro.
8. Situações de parada: sessão expirada, duplicidade, CAPTCHA, campos obrigatórios inesperados.

## Tabela de mapeamento a preencher

| Passo | Tela/título | Ação | Rótulo exato | Origem FlipForm | Obrigatório? | Como verificar |
|---|---|---|---|---|---|---|
| A preencher | | | | | | |

## Pendências antes de concluir PR 03

- Validar o Anexo 1 e o mapa com o proprietário; a regra pura mantém o mapa vazio até isso ocorrer.
- Construir painel, API com gojus_sheet e permissões no servidor, CPF mascarado por padrão e revelação auditada.
- Definir seleção de conversa/caso quando um lead tiver mais de um caso.
- Implementar anexos/ZIP privado com limite de resposta e expiração; sem credenciais novas.
- Definir o formato real do ID do GoJus antes do registro gojus.registered; não confundir com CPF ou protocolo de tribunal.
- Homologar funcionalmente PR 01/02 antes da ativação e testar o caso completo em ambiente autorizado.
- O robô (PR 04) fica fora desta preparação; depende de usuário dedicado e autorização GoJus.
