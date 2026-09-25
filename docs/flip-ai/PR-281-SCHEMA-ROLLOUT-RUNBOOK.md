# Flip AI — rollout controlado do schema

Este runbook prepara o schema já versionado do Flip AI para aplicação manual. Ele não autoriza
publicação de atendentes, ativação de planos ou execução de `prisma migrate deploy`.

## Estado confirmado em 22/09/2026

- a branch Neon `production` não possui tabelas `flip_ai_*`;
- a extensão `vector` ainda não está instalada;
- os planos `premium` e `premium-pro` ainda não existem;
- o aplicativo falha fechado enquanto esse estado persistir;
- nenhuma linha existente de Lead, Conversation, tracking ou integração precisa ser alterada.

## Bloqueio corrigido neste PR

A migration de qualificação declarava chaves como `UUID`, mas `tenants.id`, `leads.id`,
`flip_ai_agents.id` e os demais identificadores relacionados são `TEXT` no Prisma e no Neon.
O PostgreSQL rejeitaria as foreign keys. Como nenhuma migration Flip AI foi aplicada na produção,
o arquivo foi corrigido para `TEXT` antes do primeiro rollout.

## Ordem imutável de aplicação

Aplicar cada arquivo inteiro, na ordem abaixo, apenas pelo processo manual aprovado:

1. `20260909120000_flip_ai_agent_drafts`
2. `20260909160000_flip_ai_master_knowledge`
3. `20260909210000_flip_ai_knowledge_index`
4. `20260910130000_flip_ai_public_text_runtime`
5. `20260911010000_flip_ai_lead_capture`
6. `20260911160000_flip_ai_qualification_engine`
7. `20260912120000_flip_ai_external_sources`
8. `20260913120000_flip_ai_external_search_cache`

Não concatenar arquivos parcialmente, não pular etapas e não executar migrations legadas do
repositório. O projeto não possui `_prisma_migrations` em produção e sua cadeia histórica não
serve como bootstrap.

## Ensaio obrigatório

1. clonar a branch Neon `production` em uma branch temporária;
2. aplicar os oito arquivos, na ordem, na branch temporária;
3. executar `npm run flip-ai:diagnose-schema` usando a conexão direta da branch temporária;
4. confirmar que todos os itens estão `OK` e que os dois planos continuam inativos;
5. executar create/edit de rascunho somente com fixtures descartáveis;
6. descartar a branch temporária ao terminar.

## Preflight de produção

Antes da aplicação manual:

1. reconfirmar projeto, branch e database no Neon;
2. criar ou confirmar snapshot recuperável imediatamente anterior;
3. executar o diagnóstico somente leitura e guardar a saída;
4. confirmar janela operacional e responsável humano;
5. parar se qualquer tabela `flip_ai_*` já existir parcialmente.

## Aplicação manual

- usar conexão direta, nunca o hostname `-pooler`;
- aplicar uma migration por transação;
- interromper no primeiro erro;
- não repetir uma transação de resultado ambíguo sem inspeção;
- não ativar `premium` ou `premium-pro`;
- não atribuir tenants aos novos planos;
- não publicar atendentes.

## Pós-verificação

1. executar `npm run flip-ai:diagnose-schema`;
2. confirmar 14 tabelas, as 167 colunas e tipos versionados, todos os índices e constraints e a extensão `vector`;
3. confirmar que todas as chaves de `flip_ai_qualifications` são `TEXT`;
4. confirmar preços de R$ 797/R$ 1.497, ciclo mensal e `is_active = false` nos planos Premium;
5. verificar erros de runtime na Vercel;
6. manter a publicação bloqueada até os controles de créditos e orçamento estarem prontos.

Em caso de falha na produção, não executar `DROP` ou limpeza manual. Interromper e usar o
procedimento aprovado de restauração/snapshot.
