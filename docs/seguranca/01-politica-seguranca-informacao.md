# 01 — Política de Segurança da Informação

> **Versão:** 1.0 · 28/10/2026 · **Aprovação:** [PREENCHER: nome e cargo de quem aprova] em [PREENCHER: data]
> **Empresa:** [PREENCHER: razão social e CNPJ], responsável pelo FlipForm (app.flipform.com.br).
> **Revisão:** anual, ou após incidente grave ou mudança relevante.

> **Para leigos:** este é o "documento-mãe". Ele não entra em detalhes técnicos; diz **o que a empresa promete** sobre segurança, **quem é responsável** e **quais regras todos seguem**. Os outros documentos detalham cada tema.

## 1. Objetivo e alcance

Proteger os dados tratados pelo FlipForm (dados das empresas clientes, dos seus usuários e dos seus leads) contra acesso indevido, alteração e perda, e cumprir a **LGPD** (Lei 13.709/2018).

Vale para: o sistema FlipForm (aplicação, banco de dados, integrações), o código no GitHub, as contas de fornecedores (Vercel, Neon, OpenAI, Meta, Google etc.) e todas as pessoas com acesso a eles (sócios, equipe, prestadores).

## 2. Princípios

1. **Menor privilégio:** cada pessoa e cada parte do sistema recebe só o acesso necessário.
2. **Dados de cada empresa separados:** uma empresa cliente nunca vê dados de outra.
3. **Defesa em camadas:** nenhuma proteção depende de uma única trava (login + permissão + conferência da empresa + testes automáticos).
4. **Dado sensível protegido de ponta a ponta:** CPF/CNPJ criptografados, mascarados nas telas e antes de ir para a IA.
5. **Mudança só com teste e revisão:** nada vai ao ar sem passar pelos testes automáticos (ver arquivo 07).
6. **Transparência:** o que ainda não está pronto fica registrado no Registro de Riscos (arquivo 08).

## 3. Papéis e responsabilidades

| Papel | Quem | Responsabilidades |
|---|---|---|
| **Responsável pela Segurança** | [PREENCHER] | Dono destes documentos; aprova acessos administrativos; coordena incidentes; garante as revisões do calendário. |
| **Encarregado de Dados (DPO)** | [PREENCHER — pode ser a mesma pessoa] | Canal com titulares e com a ANPD; orienta sobre LGPD. Contato público: [PREENCHER: e-mail, ex.: privacidade@flipform.com.br]. |
| **Desenvolvimento** | Equipe/prestadores de código | Seguir o Desenvolvimento Seguro (arquivo 07); nunca colocar segredos no código. |
| **Super Admin da plataforma** | Pessoas com perfil Super Admin | Usar o acesso só para suporte e operação; MFA obrigatório (ver arquivo 02). |
| **Empresa cliente** | Dono/Administrador de cada empresa no FlipForm | Gerir os próprios usuários e perfis; como **controladora** dos dados dos seus leads, responder aos titulares. |

> **Para leigos:** em empresa pequena, uma pessoa pode ter vários papéis. O importante é estar **escrito** quem responde por cada coisa.

## 4. Regras para todos

1. **Senhas:** únicas, longas, guardadas em gerenciador de senhas. Nunca compartilhar.
2. **Login em duas etapas (MFA):** obrigatório em GitHub, Vercel, Neon, OpenAI, Meta Business, Google e em toda conta Super Admin do FlipForm.
3. **Segredos** (chaves de API, senhas de banco): só nas variáveis de ambiente da Vercel/GitHub. **Nunca** em código, chat, e-mail ou planilha.
4. **Dados de clientes:** acessar só quando necessário para o trabalho; não copiar para planilhas, celulares pessoais ou outras ferramentas.
5. **Suspeitou de algo, avise na hora** o Responsável pela Segurança (ver arquivo 03). Avisar rápido nunca é erro.
6. **Saída de alguém da equipe:** acessos removidos no mesmo dia (ver arquivo 02).

## 5. Controles técnicos já em funcionamento (resumo)

| Tema | O que o FlipForm faz | Onde ver |
|---|---|---|
| Login | Senha com hash bcrypt; limite de tentativas; MFA (Google Authenticator) disponível; sessão conferida no banco a cada acesso | arquivo 02 |
| Separação entre empresas | Toda consulta filtra pela empresa; teste automático proíbe o contrário | arquivo 02 e 07 |
| Dados sensíveis | CPF/CNPJ criptografados (AES-256-GCM), mascarados nas telas, "Mostrar" registrado; mascarados antes de ir para a IA | arquivo 06 |
| Tokens de integrações | Criptografados (AES-256-GCM) no banco | arquivo 05 |
| Tráfego | HTTPS obrigatório (HSTS), cabeçalhos de segurança, política de conteúdo rígida na área logada | arquivo 07 |
| Código | Testes, verificação de segredos (Gitleaks) e de código inseguro (Semgrep) em cada mudança; varredura OWASP ZAP semanal | arquivo 07 |
| Registro | Trilha de auditoria de ações importantes (login, alterações, exibição de CPF, ações do Super Admin) | arquivo 03 |

## 6. Calendário de rotinas

| Frequência | Rotina | Responsável | Prova |
|---|---|---|---|
| A cada mudança | Testes + Gitleaks + Semgrep | Automático (GitHub) | GitHub Actions |
| Semanal (segunda) | Varredura completa Gitleaks/Semgrep e OWASP ZAP | Automático | GitHub Actions (relatórios 30/90 dias) |
| Semanal | Ler os relatórios da segunda e abrir item no arquivo 08 se houver achado novo | Responsável pela Segurança | Item no arquivo 08 |
| Diária | Avaliação diária das conversas da IA | Automático + quem recebe o alerta | Tela de avaliação |
| Trimestral | Revisão de acessos (quem é Super Admin, quem tem acesso ao GitHub/Vercel/Neon) | Responsável pela Segurança | Registro no arquivo 02 |
| Trimestral | Teste de recuperação de backup | Responsável pela Segurança | Registro no arquivo 04 |
| Mensal | `npm audit` e atualização de dependências críticas | Desenvolvimento | PR no GitHub |
| Anual | Revisão de todos estes documentos; simulado de incidente | Responsável pela Segurança | Histórico do GitHub |

## 7. Descumprimento

Descumprir esta política pode levar à remoção de acessos e às medidas contratuais cabíveis. Falhas honestas comunicadas rapidamente são tratadas como aprendizado.

## 8. Histórico

| Versão | Data | O que mudou |
|---|---|---|
| 1.0 | 28/10/2026 | Primeira versão. |
