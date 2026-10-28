# 06 — Registro das Operações de Tratamento de Dados Pessoais (LGPD, art. 37)

> **Versão:** 1.0 · 28/10/2026 · **Dono:** Encarregado (DPO) · **Revisão:** anual e a cada novo tipo de dado

> **Para leigos:** a LGPD exige que a empresa tenha um **inventário dos dados pessoais**: que dados tem, de quem, para quê, com base em qual autorização da lei, com quem compartilha e por quanto tempo guarda. É como o "estoque" de dados pessoais. Este é o do FlipForm.

## 1. Papéis

- **Dados dos leads** (pessoas que preenchem formulários ou conversam no WhatsApp/site das empresas clientes): a **empresa cliente é a controladora**; o FlipForm é **operador** e trata os dados conforme as instruções dela.
- **Dados das contas** (usuários das empresas clientes, dados de cobrança): o **FlipForm é o controlador**.

## 2. Inventário

| # | Dados | De quem | Para quê | Base legal (LGPD art. 7) | Compartilhado com | Prazo de guarda |
|---|---|---|---|---|---|---|
| 1 | Nome, e-mail, senha (hash), perfil, código MFA (criptografado) | Usuários das empresas clientes | Login e controle de acesso | Execução de contrato (V) | Neon, Vercel, Resend/SMTP | Enquanto a conta existir; [PREENCHER: prazo após encerramento] |
| 2 | Dados de cobrança da empresa | Empresas clientes | Cobrança da assinatura | Execução de contrato (V); obrigação legal (II) para dados fiscais | Stripe / Asaas | Prazo fiscal (5 anos) |
| 3 | Nome, telefone, e-mail, respostas de formulário | Leads | Atendimento e vendas da empresa cliente | Definida pela controladora (em geral, consentimento ou procedimentos preliminares de contrato) | Neon, Vercel, Meta, Google (eventos de conversão) | Definido pela controladora; [PREENCHER: padrão do FlipForm após fim do contrato] |
| 4 | **CPF / CNPJ** | Leads | Identificação para o serviço da empresa cliente | Definida pela controladora | Neon (criptografado). **Não vai para a IA** (mascarado) | Igual ao item 3 |
| 5 | Conversas de WhatsApp/Instagram/site (texto, áudio, anexos) | Leads | Atendimento (humano e IA) | Definida pela controladora | Meta, OpenAI (texto/áudio, CPF mascarado), Cloudflare R2 (anexos) | Conversas: igual ao item 3. Anexos do chat do site: **7 dias** |
| 6 | Documentos enviados pelo lead (fotos de RG, certidões, carteira de trabalho…) | Leads | Análise do caso pela empresa cliente | Definida pela controladora | Meta (recebimento), armazenamento do sistema, OpenAI (leitura do documento pela IA, quando ativada) | Igual ao item 3 |
| 7 | Dados de saúde que o lead contar (ex.: doença, gravidez) — **dado sensível** | Leads | Atendimento da empresa cliente (ex.: benefício previdenciário) | Dado sensível (art. 11): definida pela controladora (em geral, consentimento específico ou exercício regular de direitos) | Como no item 5 | Igual ao item 3 |
| 8 | Registros de acesso (IP, data, ação) | Usuários | Segurança e auditoria | Legítimo interesse (IX); Marco Civil (6 meses mínimos para registros de acesso a aplicações) | Neon, Vercel | Mínimo 6 meses |

## 3. Medidas de segurança aplicadas (art. 46)

Ver arquivos 01, 02 e 07. Destaques para dados pessoais:
- CPF/CNPJ: criptografia AES-256-GCM, máscara nas telas, exibição completa só com registro na auditoria, máscara antes da IA.
- Isolamento entre empresas com teste automático.
- Acesso por perfil com menor privilégio.

## 4. Direitos dos titulares (art. 18)

- **Leads:** o pedido (acesso, correção, exclusão etc.) é respondido pela **empresa cliente** (controladora). O FlipForm ajuda tecnicamente (exportar, corrigir, excluir o lead) quando ela pedir.
- **Usuários e empresas clientes:** pedidos ao Encarregado: [PREENCHER: e-mail]. Prazo de resposta: até 15 dias.

## 5. Pendências deste registro

Ver arquivo 08: definir prazos de guarda após o fim do contrato, nomear o Encarregado, revisar termos de uso e privacidade (incluindo transferência internacional e uso de IA).
