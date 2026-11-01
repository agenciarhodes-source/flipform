# 05 — Gestão de Fornecedores

> **Versão:** 1.0 · 28/10/2026 · **Dono:** Responsável pela Segurança · **Revisão:** anual e a cada novo fornecedor

> **Para leigos:** o FlipForm não roda sozinho: usa serviços de outras empresas (hospedagem, banco, IA…). Cada uma delas pode tocar nos dados. A LGPD e as certificações pedem que saibamos **quem são, o que recebem, onde ficam e que garantias dão**. Na linguagem da LGPD, elas são **suboperadores**.

## 1. Lista de fornecedores

| Fornecedor | Para quê | Dados que recebe | Onde (país) | Proteção no FlipForm |
|---|---|---|---|---|
| **Vercel** | Hospedagem do sistema | Todo o tráfego do sistema (em trânsito) | EUA | HTTPS; segredos em variáveis de ambiente |
| **Neon** | Banco de dados | Todos os dados do sistema | EUA (us-east-1) | Conexão criptografada; CPF/CNPJ e tokens criptografados antes de gravar |
| **Cloudflare R2** | Anexos de conversas | Arquivos enviados nas conversas | [PREENCHER: região do bucket] | Armazenamento privado; links de download de 1 minuto |
| **OpenAI** | IA de atendimento, transcrição de áudio | Textos das conversas e áudios | EUA | **CPF/CNPJ mascarados antes do envio**; a API não usa os dados para treinar modelos (política da OpenAI para API) |
| **TypeSafe (JEV)** | Motor de decisão da IA (quando ativado) | Trechos de conversa | [PREENCHER] | Ativado só com aprovação (`FLIP_AI_JEV_DATA_PROCESSING_APPROVED`) |
| **Meta** (WhatsApp, Instagram, Facebook) | Mensagens e anúncios | Mensagens, contatos, eventos de conversão | EUA / global | Tokens criptografados; assinatura dos webhooks conferida |
| **Google** (Ads) | Conversões de anúncios | Eventos de conversão | EUA / global | Tokens criptografados |
| **Stripe / Asaas** | Cobrança | Dados de cobrança das empresas clientes | EUA / Brasil | Webhooks com assinatura/token conferidos |
| **Resend / SMTP** | E-mails do sistema | E-mail e nome do destinatário | [PREENCHER] | — |
| **Sentry** | Monitoramento de erros | Mensagens de erro (podem conter dados técnicos) | EUA | Coleta de dados pessoais desligada no código (`sentry.privacy.ts`): não envia corpo de requisição, cabeçalhos, cookies, parâmetros de URL, dados de banco nem variáveis; só o erro e o ID interno do usuário |
| **cron-job.org** | Dispara as rotinas a cada minuto | Nenhum dado pessoal (só chama o endereço com segredo) | Alemanha | Segredo `CRON_SECRET` |
| **GitHub** | Código e testes | Código (sem dados de clientes) | EUA | MFA; varredura de segredos |

## 2. Transferência internacional (LGPD)

A maior parte dos dados é tratada **fora do Brasil (EUA)**. A LGPD permite isso com garantias (art. 33), como **cláusulas contratuais padrão** aprovadas pela ANPD (Resolução CD/ANPD nº 19/2024) ou garantias equivalentes dos fornecedores.

Situação em 01/11/2026:
1. **Termos do FlipForm atualizados:** a Política de Privacidade (`/legal/privacy`) informa a transferência para os EUA, a base no art. 33 da LGPD e o uso de IA; os Termos de Uso (`/legal/terms`) passaram a tratar de contas, integrações, IA e fim do contrato. Revisão por advogado recomendada antes de contratos grandes.
2. **DPAs dos fornecedores** (termos de tratamento de dados):

| Fornecedor | DPA | Como vale | O que fazer | Guardado em |
|---|---|---|---|---|
| Neon | https://neon.com/dpa | Faz parte dos termos de uso (com cláusulas contratuais padrão) | Baixar o PDF | [PREENCHER: data e pasta] |
| Vercel | https://vercel.com/legal/dpa | Publicado pela Vercel para os clientes | Baixar o PDF | [PREENCHER] |
| Cloudflare | https://www.cloudflare.com/cloudflare-customer-dpa/ | Vale para contratos self-serve e enterprise | Baixar o PDF | [PREENCHER] |
| OpenAI | https://openai.com/policies/data-processing-addendum/ | **Precisa ser assinado** pelo formulário da OpenAI | Responsável assina e guarda a cópia | [PREENCHER] |
| Google Ads | https://business.safety.google/adsprocessorterms | **Precisa ser aceito** na conta do Google Ads (configurações da conta) | Responsável aceita e informa os contatos pedidos | [PREENCHER] |
| Meta | Termos do WhatsApp Business e da Cloud API | Aceitos ao criar e conectar a conta do WhatsApp Business | Registrar a data de aceite | [PREENCHER] |
| Sentry | https://sentry.io/legal/dpa/ | Publicado pela Sentry | Baixar o PDF | [PREENCHER] |

## 3. Regras para contratar um fornecedor novo

Antes de enviar qualquer dado pessoal a um fornecedor novo:

1. Ver **o que ele recebe** e se dá para mandar menos (ex.: mascarar CPF).
2. Conferir se tem **política de segurança e de privacidade** e, se possível, certificação (SOC 2, ISO 27001).
3. Guardar o **DPA** (termo de tratamento de dados).
4. Adicionar à tabela acima e ao Registro de Tratamento (arquivo 06).

## 4. Revisão anual

Uma vez por ano: conferir se cada fornecedor ainda é usado, se mudou de política e se o acesso (chaves) ainda é necessário. Chave sem uso é removida.
