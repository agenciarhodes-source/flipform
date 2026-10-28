# 03 — Plano de Resposta a Incidentes

> **Versão:** 1.0 · 28/10/2026 · **Dono:** Responsável pela Segurança · **Revisão:** anual, com um simulado por ano

> **Para leigos:** um incidente é qualquer coisa que ameace os dados ou o sistema. Este plano é o "manual do incêndio": **quem avisa quem, o que fazer primeiro e o que registrar**. Em incidente, o pior inimigo é o improviso; por isso tudo está escrito antes.

## 1. Exemplos de incidente

- Alguém de fora entrou numa conta (ou há suspeita).
- Um dado de uma empresa apareceu para outra.
- Uma chave secreta (API, banco) foi exposta (num print, num e-mail, no GitHub).
- Dados foram apagados ou alterados sem autorização.
- Um fornecedor (Vercel, Neon, OpenAI, Meta…) comunicou um vazamento.
- O sistema saiu do ar por ataque.
- Uma falha grave foi descoberta (como a rota de login só com e-mail, corrigida em 28/10/2026).

## 2. Níveis de gravidade

| Nível | Quando | Exemplo | Tempo para começar a agir |
|---|---|---|---|
| **Crítico** | Dados pessoais expostos ou provável acesso indevido | Vazamento de leads; conta Super Admin invadida | Imediato |
| **Alto** | Falha grave sem prova de uso; chave exposta | Segredo publicado; brecha descoberta | Até 4 horas |
| **Médio** | Afeta funcionamento, sem dado exposto | Sistema fora do ar | Até 24 horas |
| **Baixo** | Tentativa bloqueada, achado de varredura | Muitas tentativas de login barradas | Próxima rotina semanal |

## 3. O passo a passo (6 fases)

### Fase 1 — Avisar
Quem perceber algo avisa **na hora** o Responsável pela Segurança: [PREENCHER: nome, telefone, e-mail]. Na ausência dele: [PREENCHER: substituto].

### Fase 2 — Conter (parar o estrago)
Ações rápidas, conforme o caso:
- Encerrar sessões: "Sair de todos os dispositivos" da conta afetada; remover o usuário da empresa (o acesso cai na hora).
- **Trocar segredos expostos** na Vercel (ex.: `JWT_SECRET_CURRENT`, `INTEGRATION_SECRET_KEY`, chaves de API) e fazer novo deploy.
- Desativar a integração afetada; pausar a IA de uma empresa, se for o caso.
- Corrigir a falha via PR urgente (como no hotfix de 28/10/2026).

### Fase 3 — Investigar
Responder, com registros (auditoria do sistema, logs da Vercel, histórico do GitHub):
1. O que aconteceu e desde quando?
2. Quais dados e **quais empresas/titulares** foram afetados?
3. Ainda está acontecendo?

> Atenção: os logs da Vercel ficam disponíveis por pouco tempo. Em incidente, **salve os logs logo no início**.

### Fase 4 — Comunicar (LGPD)
O FlipForm é, na maior parte, **operador** dos dados dos leads; cada empresa cliente é a **controladora**.

| Quem | Quando avisar | Como |
|---|---|---|
| **Empresa cliente afetada** (controladora) | **Em até 24 horas** após confirmar que os dados dela foram afetados | E-mail ao Dono da empresa + telefone, com o que se sabe até o momento |
| **ANPD e titulares** | Quando houver risco ou dano relevante: a comunicação cabe ao **controlador**, no prazo da regulamentação da ANPD (Resolução CD/ANPD nº 15/2024: **3 dias úteis** a partir do conhecimento) | Formulário no site da ANPD. Quando o FlipForm for o controlador (dados das contas dos próprios clientes), o FlipForm comunica |

O comunicado deve ter: o que aconteceu, quais dados, quantos titulares, o que já foi feito, riscos e o que o titular pode fazer, contato do Encarregado.

### Fase 5 — Recuperar
Restaurar dados (arquivo 04), religar integrações, confirmar que tudo voltou ao normal.

### Fase 6 — Aprender
Em até 5 dias úteis, registrar o incidente na tabela abaixo e abrir itens no Registro de Riscos (arquivo 08) para evitar que se repita.

## 4. Registro de incidentes

| Data | Nível | O que aconteceu | Dados afetados | Ações | Comunicação | Lições |
|---|---|---|---|---|---|---|
| 28/10/2026 | Alto | Encontrada rota antiga (`/api/auth/register`) que criava sessão só com o e-mail de um usuário autorizado, sem senha nem MFA | Sem evidência de uso (não verificado nos logs) | Rota removida (PR #534); teste automático passou a listar e conferir toda forma de login; recomendada a saída de todas as sessões do Super Admin | Interna | Varredura de rotas virou teste permanente (T2) |

## 5. Contatos úteis

| Quem | Contato |
|---|---|
| Responsável pela Segurança | [PREENCHER] |
| Encarregado (DPO) | [PREENCHER] |
| ANPD | https://www.gov.br/anpd (Comunicação de Incidente de Segurança) |
| Suporte Vercel / Neon / OpenAI / Meta | Pelos painéis de cada serviço |
