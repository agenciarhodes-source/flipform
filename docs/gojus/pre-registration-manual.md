# GoJus — manual de pré-cadastro (observação inicial)

Fonte: três telas fornecidas pelo operador e descrição verbal do fluxo. Nenhuma credencial, URL privada, imagem de cliente ou identificador de empresa neste arquivo. Ainda não validado para execução real.

## Roteiro observado

1. Login: E-mail, Senha, Entrar; não persistir a sessão fora do worker autorizado.
2. Página Pré-cadastro de Clientes, aba Pré-cadastros. Botão Pré-cadastrar cliente.
3. Modal Pré-cadastrar cliente: Nome do cliente; CPF do cliente; Senha do INSS (marcada obrigatória, operador relata aceitar vazio; verificar sem credencial em ambiente de teste); Telefone; WhatsApp; Relato do caso; Menor de idade; Benefício; Estado; Cidade; Escolher arquivo; Salvar.
4. Upload de um PDF único reunindo documentos pessoais, do caso e instrumentos assinados. O operador informa que esse é o procedimento desejado; ainda falta verificar limites e comportamento real do upload.
5. Salvar somente depois de revisão humana inicial; evidência de sucesso, ID e comportamento para CPF já cadastrado ainda não observados.

O painel exibe Pendência Documental, Documentação Recebida, Documentação Aprovada, Documentação Reprovada. A coluna seguinte está cortada. Não equivaler esses estados ao andamento judicial sem validar. Há abas Analytics e Tutorial, controles Filtrar e Baixar. Conteúdo de Tutorial, pesquisa por CPF e resultado do cadastro ainda não fornecidos.

## Motor de PDF — sem tokens de IA

- Ler apenas referências autorizadas de arquivos existentes no R2, sob tenant, lead e conversa. Não buscar por URL arbitrária. Selecionar versões atuais verificadas; manifesto fechado antes do processamento.
- Validar tipo pelo conteúdo, limites de bytes, pixels e páginas; rejeitar arquivos truncados, protegidos por senha ou não suportados até revisão humana.
- Converter imagens para páginas e copiar páginas de PDFs por biblioteca determinística, sem OCR ou chamadas ao modelo para montar o arquivo. Preservar legibilidade, corrigir orientação conhecida e comprimir imagens somente se necessário.
- Preservar originais assinados e seus hashes. A união de PDFs pode invalidar assinaturas digitais criptográficas: o PDF agregado é cópia de apresentação, não substitui o original. Confirmar aceitação do GoJus e do fluxo jurídico; nunca apagar os originais.
- Usar cache por hash dos arquivos e versão do motor; não repetir leitura por IA sem necessidade. Relato do caso deve ser revisado e não conter credenciais.
- Artefato temporário privado com expiração e controle de acesso. Não servir payload acima do limite de resposta; upload pelo worker autorizado. Limite real do GoJus ainda não confirmado.
- Não coletar, extrair ou armazenar senha pessoal gov.br em memória, prompts, logs, tarefas ou ficha. Verificar acesso delegado oficial com o escritório. Não implementar preenchimento automático de credencial pessoal nesta etapa.

## Pendências

- Abrir Benefício e Menor de idade para registrar opções exatas e campos condicionais.
- Confirmar UF/cidade, validação sem senha, tamanho do PDF, confirmação/ID após salvar e busca por CPF em ambiente autorizado.
- Registrar tutorial a partir de texto, prints ou gravação sanitizada fornecidos pelo operador. Não alegar que o tutorial foi lido antes de recebê-lo.
- Confirmar seletores reais e permissões da conta de serviço, política de duplicidade e limites de execução.
- Manter gojus_sheet, gojus_robot e gojus_status_lookup desativados até homologação e autorização. Este PR apenas adiciona regras puras e documentação, não implementa o gerador PDF, nem acesso ao GoJus.
