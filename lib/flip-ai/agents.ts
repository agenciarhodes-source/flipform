import 'server-only';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { SessionPayload } from '@/lib/auth';
import { FlipAiError, requireFlipAiAccess, type FlipAiDb } from './access';
import { agentDraftSchema, type AgentDraft, type AgentDraftInput, type AgentWorkspace, type KnowledgeMasterSummary } from './policy';

async function ensureSchema(db: FlipAiDb) {
  const rows = await db.$queryRaw<Array<{ ready: boolean }>>(Prisma.sql`
    SELECT to_regclass('public.flip_ai_agents') IS NOT NULL
      AND to_regclass('public.flip_ai_endpoints') IS NOT NULL AS ready
  `);
  if (!rows[0]?.ready) throw new FlipAiError('FLIP_AI_SCHEMA_NOT_READY', 503, 'O Flip AI está em preparação. Tente novamente após a ativação.');
}
async function selectDrafts(db: FlipAiDb, tenantId: string, id?: string): Promise<AgentDraft[]> {
  const rows = await db.$queryRaw<Array<Omit<AgentDraft, 'updatedAt'> & { updatedAt: Date }>>(Prisma.sql`
    SELECT a.id, a.name, a.description, a.primary_color AS "primaryColor", a.style,
      a.pipeline_id AS "pipelineId", a.initial_stage_id AS "initialStageId", e.slug,
      a.status, a.version, a.updated_at AS "updatedAt"
    FROM flip_ai_agents a JOIN flip_ai_endpoints e ON e.agent_id = a.id AND e.tenant_id = a.tenant_id
    WHERE a.tenant_id = ${tenantId} AND a.status = 'draft'
      ${id ? Prisma.sql`AND a.id = ${id}` : Prisma.empty}
    ORDER BY a.created_at DESC, a.id DESC
  `);
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString(), knowledge: null }));
}
async function selectKnowledgeSummaries(db: FlipAiDb, tenantId: string): Promise<Map<string, KnowledgeMasterSummary>> {
  const ready = await db.$queryRaw<Array<{ ready: boolean }>>(Prisma.sql`
    SELECT to_regclass('public.flip_ai_knowledge_bases') IS NOT NULL
      AND to_regclass('public.flip_ai_knowledge_documents') IS NOT NULL AS ready
  `);
  if (!ready[0]?.ready) return new Map();
  const rows = await db.$queryRaw<Array<{ agentId: string; title: string; revision: number; byteSize: number; contentHash: string; updatedAt: Date }>>(Prisma.sql`
    SELECT kb.agent_id AS "agentId", d.title, d.current_revision AS revision, d.byte_size AS "byteSize",
      d.current_hash AS "contentHash", d.updated_at AS "updatedAt"
    FROM flip_ai_knowledge_bases kb
    JOIN flip_ai_knowledge_documents d ON d.knowledge_base_id = kb.id AND d.tenant_id = kb.tenant_id
    WHERE kb.tenant_id = ${tenantId} AND d.source_key = 'master'
  `);
  return new Map(rows.map((row) => [row.agentId, { ...row, updatedAt: row.updatedAt.toISOString() }]));
}

async function validateDestination(db: FlipAiDb, tenantId: string, input: AgentDraftInput) {
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT s.id FROM pipeline_stages s JOIN pipelines p ON p.id = s.pipeline_id
    WHERE p.tenant_id = ${tenantId} AND p.id = ${input.pipelineId} AND s.id = ${input.initialStageId}
      AND NOT p.is_archived AND NOT s.is_archived FOR SHARE OF p, s
  `);
  if (!rows.length) throw new FlipAiError('INVALID_DESTINATION', 400, 'Escolha um pipeline e uma etapa ativos desta empresa.');
}
export async function getAgentDraftWorkspace(session: SessionPayload): Promise<AgentWorkspace> {
  return prisma.$transaction(async (db) => {
    const { tenantId } = await requireFlipAiAccess(db, session);
    await ensureSchema(db);
    const [agents, pipelines, knowledge] = await Promise.all([
      selectDrafts(db, tenantId),
      db.pipeline.findMany({ where: { tenantId, isArchived: false }, orderBy: { name: 'asc' }, select: {
        id: true, name: true, stages: { where: { isArchived: false }, orderBy: { orderIndex: 'asc' }, select: { id: true, name: true } },
      } }),
      selectKnowledgeSummaries(db, tenantId),
    ]);
    return { agents: agents.map((agent) => ({ ...agent, knowledge: knowledge.get(agent.id) || null })), pipelines };
  });
}
export async function saveAgentDraft(session: SessionPayload, rawInput: AgentDraftInput,
  operation: { kind: 'create'; requestId: string } | { kind: 'update'; id: string; version: number },
): Promise<AgentDraft> {
  const parsed = agentDraftSchema.safeParse(rawInput);
  if (!parsed.success) throw new FlipAiError('INVALID_DRAFT', 400, 'Revise os dados do atendente.');
  const input = parsed.data;
  return prisma.$transaction(async (db) => {
    const { tenantId, userId } = await requireFlipAiAccess(db, session);
    await ensureSchema(db);
    await db.$queryRaw(Prisma.sql`SELECT id FROM tenants WHERE id = ${tenantId} FOR UPDATE`);
    const id = operation.kind === 'create' ? operation.requestId : operation.id;
    const existing = (await selectDrafts(db, tenantId, id))[0];
    if (operation.kind === 'create' && existing) {
      const same = Object.entries(input).every(([key, value]) => existing[key as keyof AgentDraft] === value);
      if (!same) throw new FlipAiError('REQUEST_CONFLICT', 409, 'Esta solicitação já foi salva com outros dados. Atualize a lista.');
      return existing;
    }
    if (operation.kind === 'update' && !existing) throw new FlipAiError('AGENT_NOT_FOUND', 404, 'Atendente não encontrado.');
    await validateDestination(db, tenantId, input);
    if (operation.kind === 'create') {
      await db.$executeRaw(Prisma.sql`INSERT INTO flip_ai_agents
        (id, tenant_id, name, description, primary_color, style, pipeline_id, initial_stage_id, status, version, created_by, created_at, updated_at)
        VALUES (${id}, ${tenantId}, ${input.name}, ${input.description}, ${input.primaryColor}, ${input.style},
          ${input.pipelineId}, ${input.initialStageId}, 'draft', 1, ${userId}, NOW(), NOW())`);
      await db.$executeRaw(Prisma.sql`INSERT INTO flip_ai_endpoints (id, tenant_id, agent_id, slug, created_at, updated_at)
        VALUES (${randomUUID()}, ${tenantId}, ${id}, ${input.slug}, NOW(), NOW())`);
    } else {
      const changed = await db.$executeRaw(Prisma.sql`UPDATE flip_ai_agents SET name = ${input.name},
        description = ${input.description}, primary_color = ${input.primaryColor}, style = ${input.style},
        pipeline_id = ${input.pipelineId}, initial_stage_id = ${input.initialStageId}, version = version + 1, updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId} AND status = 'draft' AND version = ${operation.version}`);
      if (changed !== 1) throw new FlipAiError('VERSION_CONFLICT', 409, 'Este atendente mudou em outra sessão. Atualize a lista antes de editar.');
      await db.$executeRaw(Prisma.sql`UPDATE flip_ai_endpoints SET slug = ${input.slug}, updated_at = NOW()
        WHERE agent_id = ${id} AND tenant_id = ${tenantId}`);
    }
    await db.auditLog.create({ data: { tenantId, userId, entityType: 'flip_ai_agent', entityId: id,
      action: operation.kind === 'create' ? 'created' : 'updated', metadata: { status: 'draft' } } });
    const saved = (await selectDrafts(db, tenantId, id))[0];
    if (!saved) throw new FlipAiError('AGENT_NOT_FOUND', 500, 'Não foi possível confirmar o rascunho salvo.');
    return saved;
  });
}
