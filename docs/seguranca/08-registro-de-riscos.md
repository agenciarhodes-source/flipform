# 08 — Registro de Riscos e Pendências

> **Versão:** 1.0 · 28/10/2026 · **Dono:** Responsável pela Segurança · **Revisão:** semanal (rápida) e trimestral (completa)

> **Para leigos:** este é o documento mais honesto da pasta. Ele lista **o que ainda não está bom**, o tamanho do risco e o plano. Auditores valorizam muito esta lista: ela mostra que a empresa conhece os próprios pontos fracos e trabalha neles.
>
> **Como ler o risco:** Probabilidade (chance de acontecer) × Impacto (estrago se acontecer) = Prioridade.

## 1. Pendências abertas

| # | Risco / pendência | Prob. | Impacto | Prioridade | Plano | Dono | Prazo | Status |
|---|---|---|---|---|---|---|---|---|
| R1 | Backup do banco: tinha só 6 horas de histórico e nenhuma cópia agendada | — | — | — | PITR de 7 dias, snapshot diário por 30 dias e ramo `production` protegido | Responsável | 28/10/2026 | **Resolvido** (recuperação testada em 31/10/2026, R13) |
| R2 | Repositório de código **público** | Média | Alto | Alta | Tornar privado (fase 0) | Responsável | Fase 0 | Aberto |
| R3 | MFA não ativado nas contas (FlipForm Super Admin, GitHub, Vercel, Neon, OpenAI, Meta, Google) | Média | Muito alto | Alta | Ativar Google Authenticator em todas (fase 0) | Responsável | Fase 0 | Aberto |
| R4 | Ramo `main` sem proteção (dá para enviar código sem PR/testes) | Baixa | Alto | Média | Ativar proteção de branch no GitHub (fase 0) | Responsável | Fase 0 | Aberto |
| R5 | Encarregado (DPO) não nomeado; contatos de incidente em branco | Média | Médio | Média | Nomear e preencher os `[PREENCHER]` dos documentos | Responsável | 30 dias | Aberto |
| R6 | Dados nos EUA sem DPA/cláusulas guardados; termos de uso/privacidade a revisar (transferência internacional, uso de IA) | Média | Médio | Média | Baixar e guardar DPAs (Vercel, Neon, OpenAI, Cloudflare, Meta); revisar termos com advogado | Responsável | 60 dias | Aberto |
| R7 | Prazo de guarda dos dados após o fim do contrato não definido | Baixa | Médio | Média | Definir prazo padrão e rotina de exclusão | Encarregado | 60 dias | Aberto |
| R8 | Não verificado se a rota de login só com e-mail (removida em 28/10/2026) foi usada | Baixa | Alto | Média | Consultar logs disponíveis; trocar sessões do Super Admin ("Sair de todos os dispositivos") | Responsável | 7 dias | Aberto |
| R9 | Política de conteúdo (CSP) permissiva nas páginas públicas (exigida pelo Pixel/login da Meta) — achado médio do OWASP ZAP | Baixa | Baixo | Baixa | Restringir aos domínios da Meta quando possível, sem quebrar integrações | Desenvolvimento | Próximo trimestre | Aceito por ora |
| R10 | Ações do GitHub fixadas por versão, não por "impressão digital" (SHA) — 22 avisos do Semgrep | Baixa | Médio | Baixa | Fixar por SHA | Desenvolvimento | Próximo trimestre | Aberto |
| R11 | npm sem espera mínima para pacotes recém-publicados (proteção contra pacote adulterado) | Baixa | Médio | Baixa | Configurar idade mínima de publicação | Desenvolvimento | Próximo trimestre | Aberto |
| R12 | Dependências com alertas moderados (zod, Sentry/OpenTelemetry, esbuild) | Baixa | Baixo | Baixa | Atualizar em PRs dedicados | Desenvolvimento | Próximo trimestre | Aberto |
| R13 | Teste de recuperação de backup nunca realizado | — | — | — | Primeiro teste feito em 31/10/2026 (ver 04-backup-e-recuperacao.md, seção 6); repetir a cada 3 meses | Responsável | 31/10/2026 | **Resolvido** (próximo teste até 31/01/2027) |

## 2. Riscos tratados (histórico)

| Data | O que foi resolvido |
|---|---|
| out/2026 | Fase 1: dependências críticas atualizadas (109 → 25 alertas, 0 críticos); sessão conferida no banco; limite de tentativas compartilhado; proteção de formulários contra robôs; MFA disponível; CSP rígida na área logada; CPF/CNPJ criptografados e mascarados; fim de alterações de banco em tempo de execução |
| 28/10/2026 | Fase 2: Gitleaks + Semgrep a cada mudança (T1); testes de rotas, isolamento entre empresas e permissões (T2); OWASP ZAP semanal (T3) |
| 28/10/2026 | Removida a rota que criava sessão só com e-mail (hotfix #534) |
| 28/10/2026 | Telas do Super Admin passaram a conferir a sessão no banco; criptografia de tokens com selo de tamanho fixo |
| 28/10/2026 | Backup do banco: histórico de 7 dias, cópia diária por 30 dias, ramo de produção protegido (R1) |
| 31/10/2026 | Primeiro teste de recuperação de backup: snapshot restaurado num ramo separado, dados idênticos à produção (R13) |
