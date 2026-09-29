# PR #317 — modo piloto controlado do Flip AI

## Objetivo

Permitir um teste real e isolado do Flip AI antes da ativação comercial dos planos Premium. O acesso
piloto é concedido somente por uma allowlist server-side de IDs de tenant.

## Guardas

- a configuração aceita no máximo 10 UUIDs explícitos;
- wildcard, ID parcial, duplicidade ou qualquer entrada inválida fazem a allowlist inteira falhar fechada;
- o tenant continua vindo da sessão ou da resolução server-side do endpoint público;
- somente owner/admin pode acessar o painel pelo modo piloto;
- tenant bloqueado, suspenso, cancelado ou com assinatura encerrada não recebe o bypass;
- o chat continua exigindo atendente publicado e todas as guardas de destino e conhecimento;
- a interface informa claramente que o plano contratado não foi alterado.

## Fora de escopo

- ativar Premium ou Premium Pro globalmente;
- alterar plano ou assinatura de qualquer tenant;
- cadastrar o tenant piloto na variável de produção durante o merge;
- criar migration ou alterar schema;
- lançar ou debitar créditos;
- alterar Leads, Kanban, Meta, Google, WhatsApp, domínios ou credenciais.

## Rollout posterior e separado

Depois do merge e de Production READY:

1. identificar o UUID exato do tenant de teste por leitura no painel administrativo;
2. obter autorização explícita para alterar somente `FLIP_AI_PILOT_TENANT_IDS` na Vercel;
3. cadastrar um único UUID inicialmente, sem wildcard;
4. aguardar o redeploy automático e confirmar `/api/health`;
5. testar o painel, a indexação, a publicação e o chat público;
6. remover o UUID imediatamente se qualquer health check regredir.

O merge deste PR não modifica nenhuma variável da Vercel nem qualquer registro no Neon.
