# PR 00 — A2-C.10 | Compatibilidade Prisma 5.22 e matriz de isolamento

**Estado: GATE BLOQUEADO. Documento e testes OFFLINE, sem SQL aplicado ao Neon.**

## Alcance e baseline confirmado

- Repositório privado: agenciarhodes-source/flipform. Main no commit 6def5c5ed92920deadd0f83806f057da4219a022, schema Prisma SHA 1b82864d1034c41694ac349bc7cfdd8f42e81973 (92 modelos, Prisma 5.22.0).
- PR #619 aberto sem merge; sua evidência A2-C.9: seis constraints validadas em laboratório, quatro vínculos incorretos rejeitados, três válidos aceitos. Isso NÃO comprovou suporte completo do Prisma.
- Neon: staging principal br-icy-glitter-bcisq63l tem zero tabelas. Esta etapa não realiza queries de escrita, migrations, DDL, deploy ou alterações em dados.

## Compatibilidade que o CI irá provar

Uma fixture fictícia modela relação pai-filho opcional com tenantId obrigatório e parentId opcional usando FK composta (parent_id, tenant_id).

1. Caso de controle: Prisma 5.22 validate e migrate diff OFFLINE com onDelete: Restrict. SQL esperado: FK composta e ON DELETE RESTRICT.
2. Caso de risco: Prisma 5.22 validate e migrate diff OFFLINE com onDelete: SetNull. PostgreSQL 17 exige ON DELETE SET NULL (parent_id) para que tenant_id permaneça intacto.
3. Se o Prisma rejeitar a modelagem ou gerar ON DELETE SET NULL sem a lista da coluna, o teste ficará xfail, com **GATE BLOQUEADO**. CI verde com xfail não é aprovação de segurança.
4. Mesmo que o Prisma gere SQL seguro, continuam pendentes db pull, Client generate, connect/disconnect, drift, diferenças entre migrations e constraints manuais, e comportamento real de ON DELETE em banco fictício.

**Não utilizar relação composta com SET NULL amplo, nem converter tenantId obrigatório em opcional.** SQL customizado revisado pode ser necessário; sua estabilidade na introspecção ainda precisa ser demonstrada.

## Inventário completo das 22 FKs diretas sem correspondência composta de tenant

| Tabela filha | Pai | ON DELETE atual | Prioridade |
|---|---|---|---|
| `leads` | `pipelines` | RESTRICT | P0 |
| `leads` | `forms` | SET NULL | P0 |
| `tasks` | `leads` | CASCADE | P0 |
| `forms` | `pipelines` | RESTRICT | P0 |
| `messages` | `conversations` | CASCADE | P0 |
| `messages` | `messages` | SET NULL | P0 |
| `conversations` | `leads` | SET NULL | P0 |
| `conversations` | `external_contact_identities` | CASCADE | P0 |
| `external_contact_identities` | `leads` | SET NULL | P0 |
| `payments` | `subscriptions` | SET NULL | P0 |
| `tenant_whatsapp_ai_settings` | `tenant_whatsapp_connections` | CASCADE | P0 |
| `tenant_instagram_ai_settings` | `tenant_instagram_connections` | CASCADE | P0 |
| `lead_purchases` | `leads` | CASCADE | P0 |
| `flip_ai_agents` | `pipelines` | RESTRICT | P1 |
| `flip_ai_agents` | `lead_assignment_rotations` | SET NULL | P1 |
| `flip_ai_qualifications` | `leads` | SET NULL | P1 |
| `flip_suggestions` | `leads` | CASCADE | P1 |
| `lead_assignment_rotations` | `forms` | CASCADE | P1 |
| `lead_attributions` | `leads` | CASCADE | P1 |
| `lead_stage_suggestions` | `leads` | CASCADE | P1 |
| `notes` | `leads` | CASCADE | P1 |
| `whatsapp_ai_conversation_reviews` | `conversations` | CASCADE | P1 |

## Relações transitivas / coerência de pipeline

- form_fields → forms; lead_answers → leads; lead_assignment_rotation_members → lead_assignment_rotations; lead_stage_history → leads; pipeline_stages → pipelines.
- A etapa atual do lead deve corresponder ao pipeline atual. O histórico pode apontar para etapas antigas legitimamente; NÃO alterar histórico retrospectivo automaticamente.
- As chaves de users são globais; validar atribuições de usuários por tenant_users e regras de acesso, sem criar tenant_id fictício em users.
- Ações ON DELETE CASCADE existentes devem ser preservadas caso a relação de negócio exija; sem DELETE nem TRUNCATE nesta etapa.
- O ensaio A2-C.9 introduziu ON UPDATE RESTRICT nas FKs experimentais, enquanto algumas FKs do schema anterior usavam ON UPDATE CASCADE. Essa diferença exige decisão expressa antes de substituir constraints.

## Próximos gates para implementar

1. Obter resultado real dos dois probes Prisma 5.22 no CI, registrar aviso ou xfail e revisar o SQL efetivamente gerado.
2. Testar modelo seguro de SET NULL parcial e introspecção numa NOVA branch isolada com dados exclusivamente sintéticos, mediante autorização separada.
3. Mapear todos os writers: API, IA, formulários, Inbox, webhooks e pagamentos; criar testes tenant A/B autenticados, sem acionamento de integrações.
4. Planejar updates e alterações de índices com plano de recuperação e inspeção agregada de integridade, sem mexer em dados reais.
5. RLS necessita role não-proprietária, contexto do tenant por transação e testes próprios; não habilitar agora.
6. Nenhum merge, deploy, PR 01 ou mudança no Prisma schema oficial sem autorização específica.

Referências: https://www.postgresql.org/docs/17/ddl-constraints.html ; https://docs.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations
