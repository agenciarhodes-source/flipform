# 07 — Desenvolvimento Seguro e Gestão de Mudanças

> **Versão:** 1.0 · 28/10/2026 · **Dono:** Responsável pela Segurança · **Revisão:** anual

> **Para leigos:** a maioria das falhas de segurança nasce de uma mudança no código. Este documento mostra a "esteira" por onde toda mudança passa antes de chegar aos clientes, e as travas automáticas em cada etapa.

## 1. A esteira de uma mudança

1. **Branch:** a mudança é feita numa cópia separada do código (nunca direto no `main`).
2. **PR (Pull Request):** um pedido de entrada da mudança, com descrição do que faz.
3. **Testes automáticos (CI)** rodam no GitHub:
   - verificação de tipos e build;
   - mais de 1.500 testes (TypeScript e Python), incluindo os de segurança;
   - **Gitleaks**: procura senhas e chaves no código novo;
   - **Semgrep**: procura padrões de código inseguro (OWASP Top 10, React, TypeScript).
4. **Revisão e aprovação** do responsável e **merge**.
5. **Deploy** automático na Vercel (staging e produção).
6. **Verificação pós-deploy**: testes de fumaça e conferência do site no ar.

## 2. Testes de segurança permanentes

| Teste | O que garante |
|---|---|
| `test_security_t2_route_guards_static.py` | Toda rota da API tem proteção conhecida (login, permissão, segredo de rotina, assinatura de webhook ou limite de tentativas). |
| `test_security_t2_tenant_scope_static.py` | Nenhuma rota de empresa usa um número da requisição sem conferir a empresa. |
| `security-t2-rbac.test.ts` | A tabela de permissões por perfil continua correta. |
| `security-t2-crypto.test.ts` | A criptografia de tokens funciona e recusa adulteração. |
| `test_security_session_creation_static.py` | Toda forma de entrar no sistema confere a identidade antes. |
| `test_security_s*` | Proteções das fases anteriores (sessão, limite de tentativas, MFA, CSP, CPF/CNPJ, sem alteração de banco em tempo de execução). |

## 3. Varreduras semanais (toda segunda-feira)

| Ferramenta | O que faz | Onde fica o relatório |
|---|---|---|
| Gitleaks (histórico completo) | Procura segredos em todo o histórico do código | GitHub Actions → "Security" (30 dias) |
| Semgrep (código completo) | Procura código inseguro em todo o sistema | GitHub Actions → "Security" (30 dias) |
| OWASP ZAP (baseline) | Visita o sistema de **staging** (nunca a produção) e verifica cabeçalhos, cookies e falhas web conhecidas, sem atacar | GitHub Actions → "Security - OWASP ZAP" (90 dias) |

## 4. Regras para quem programa

1. **Nunca** colocar segredo no código; usar variáveis de ambiente.
2. Toda rota nova usa um dos "porteiros" (`withPermission`, `withAuth`, `withPlatformAdmin`, `withFlipAiSession`) ou é justificada na lista do teste de rotas.
3. Toda consulta de dados de empresa inclui a empresa (`tenantId`).
4. Dados sensíveis (CPF/CNPJ) usam as funções de proteção existentes (`lib/privacy`).
5. Mudança de banco: só aditiva, aplicada **antes** do merge e com autorização.
6. Dependências: atualizar quando houver alerta crítico ou alto (`npm audit`).

## 5. Mudanças de emergência

Uma correção urgente (como o hotfix de 28/10/2026) segue a mesma esteira, com prioridade, e é registrada no plano de incidentes (arquivo 03).
