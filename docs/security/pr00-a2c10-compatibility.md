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


## Resultado concreto do CI — incompatibilidade confirmada (commit `be08ab26`)

A execução do CI da branch do PR #620 revelou inequivocamente o motivo do único `xfail`:

- `1276 passed, 1 xfailed, 1 warning, 6 subtests passed`
- Marcador da advertência: `A2C10_SETNULL_DIAGNOSTIC=UNSAFE_BARE_SET_NULL`.
- SQL emitido pelo Prisma 5.22.0 para a fixture fictícia:

```sql
ALTER TABLE "a2c10_child" ADD CONSTRAINT "a2c10_child_parent_id_tenant_id_fkey"
FOREIGN KEY ("parent_id", "tenant_id") REFERENCES "a2c10_parent"("id", "tenant_id")
ON DELETE SET NULL ON UPDATE RESTRICT;
```

**Problema:** `ON DELETE SET NULL` sem lista de colunas aplicaria o `SET NULL` a **parent_id e tenant_id**, mas `tenant_id` é obrigatório. Não autorizar adoção desta FK gerada pelo Prisma para relações opcionais.

### Prova PostgreSQL 17: sintaxe segura, laboratório sem exclusões

Em **nova branch isolada** `pr00-a2c10-setnull-temporary-probe-20261117` (`br-damp-recipe-bc7u81ck`), filha direta das fixtures A2-C.4, foram criadas e validadas apenas duas constraints adicionais:

```sql
-- EXEMPLO CONCEITUAL APENAS; NÃO EXECUTAR EM PRODUÇÃO
UNIQUE (forms.id, forms.tenant_id)
FOREIGN KEY (leads.form_id, leads.tenant_id)
REFERENCES forms(id, tenant_id)
ON UPDATE CASCADE ON DELETE SET NULL (form_id)
```

Consulta a `pg_constraint` na branch confirmou:
`FOREIGN KEY (form_id, tenant_id) REFERENCES forms(id, tenant_id) ON UPDATE CASCADE ON DELETE SET NULL (form_id)`.

As tabelas `tenants` e `leads` continuam com dois registros fictícios cada, `forms` com zero e checksum dos leads `82921cd235a03124a4b81f54df339e73`. **Nenhum DELETE foi executado**. A definição da constraint foi validada, mas o comportamento real de exclusão e as operações Prisma `db pull`, `connect`/`disconnect`, geração de Client, drift e migrations manuais permanecem **não testados**.

### Decisão técnica provisória

1. **Bloquear** FK composta opcional com `onDelete: SetNull` gerada automaticamente pelo Prisma 5.22.
2. **Propor** SQL PostgreSQL manual com `ON DELETE SET NULL (coluna_opcional)`, sujeito a revisão humana e controle de drift, sem aplicação fora do laboratório.
3. Estudar duas opções arquiteturais: (a) manter uma FK composta gerenciada exclusivamente via SQL revisado, com plano para evitar que Prisma Migrate a substitua; (b) usar `onDelete: Restrict` mais operação explícita e atômica de desvinculação, somente se preservar a semântica de negócio nos sete vínculos opcionais.
4. Preservar as FKs legadas e `tenant_id NOT NULL` até que o plano de migração tenha testes completos e aprovação separada.
5. Testar exclusão de **dados fictícios** e introspecção na nova branch exclusivamente com autorização adicional; esta etapa **não executou exclusões**.

**Gate A2-C.10: BLOQUEADO quanto ao suporte seguro de SetNull pelo Prisma 5.22. PR #619 e PR #620 permanecem sem autorização para merge. PR 01 bloqueado.**
