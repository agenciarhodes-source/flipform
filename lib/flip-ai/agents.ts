import 'server-only';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { SessionPayload } from '@/lib/auth';
import { FlipAiError, requireFlipAiAccess, type FlipAiDb } from './access';
import { agentDraftSchema, type AgentDraft, type AgentDraftInput, type AgentWorkspace, type KnowledgeMasterSummary } from './policy';
import { inspectAgentPublicationReadiness } from './publication';
import {
  hasAnyFlipAiActionCapability,
  parseFlipAiActionCapabilities,
} from './action-capabilities';

async function ensureSchema(db: FlipAiDb) {
  const rows = await db.$queryRaw<Array<{ ready: boolean }>>(Prisma.sql`
    SELECT to_regclass('public.flip_ai_agents') IS NOT NULL
      AND to_regclass('public.flip_ai_endpoints') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'flip_ai_agents' AND column_name = 'rotation_id'
      ) AS ready
  `);
  if (!rows[0]?.ready) throw new FlipAiError('FLIP_AI_SCHEMA_NOT_READY', 503, 'O Flip AI está em preparação. Tente novamente após a ativação.');
}
async function appearanceSchemaReady(db: FlipAiDb) {
  const rows = await db.$queryRaw<Array<{ ready: boolean }>>(Prisma.sql`
    SELECT COUNT(*) = 4 AS ready
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'flip_ai_agents'
      AND column_name IN ('avatar_url', 'chat_background_color', 'user_message_color', 'send_button_color')
  `);
  return Boolean(rows[0]?.ready);
}
async function actionCapabilitiesSchemaReady(db: FlipAiDb) {
  const rows = await db.$queryRaw<Array<{ ready: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'flip_ai_agents'
        AND column_name = 'action_capabilities'
    ) AS ready
  `);
  return Boolean(rows[0]?.ready);
}
type AgentRow = Omit<AgentDraft, 'updatedAt' | 'knowledge' | 'publication'> & { updatedAt: Date };
type RawAgentRow = Omit<AgentRow, 'actionCapabilities'> & { actionCapabilities: unknown };
async function selectAgents(db: FlipAiDb, tenantId: string, id?: string): Promise<AgentRow[]> {
  const rows = await db.$queryRaw<RawAgentRow[]>(Prisma.sql`
    SELECT a.id, a.name, a.description, a.primary_color AS "primaryColor",
      to_jsonb(a)->>'avatar_url' AS "avatarUrl",
      to_jsonb(a)->>'chat_background_color' AS "chatBackgroundColor",
      to_jsonb(a)->>'user_message_color' AS "userMessageColor",
      to_jsonb(a)->>'send_button_color' AS "sendButtonColor",
      COALESCE(to_jsonb(a)->'action_capabilities', '{}'::jsonb) AS "actionCapabilities", a.style,
      a.pipeline_id AS "pipelineId", a.initial_stage_id AS "initialStageId", a.rotation_id AS "rotationId", e.slug,
      a.status, a.version, a.updated_at AS "updatedAt"
    FROM flip_ai_agents a JOIN flip_ai_endpoints e ON e.agent_id = a.id AND e.tenant_id = a.tenant_id
    WHERE a.tenant_id = ${tenantId} AND a.status IN ('draft', 'published')
      ${id ? Prisma.sql`AND a.id = ${id}` : Prisma.empty}
    ORDER BY a.created_at DESC, a.id DESC
  `);
  return rows.map((row) => ({
    ...row,
    actionCapabilities: parseFlipAiActionCapabilities(row.actionCapabilities),
  }));
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
  if (input.rotationId) {
    const rotation = await db.leadAssignmentRotation.findFirst({
      where: {
        id: input.rotationId,
        tenantId,
        isEnabled: true,
        form: { tenantId, pipelineId: input.pipelineId, isActive: true },
      },
      select: { id: true },
    });
    if (!rotation) throw new FlipAiError('INVALID_ROTATION', 400,
      'Escolha um rodízio ativo ligado ao mesmo pipeline do atendente.');
  }
}
export async function getAgentDraftWorkspace(session: SessionPayload): Promise<AgentWorkspace> {
  return prisma.$transaction(async (db) => {
    const { tenantId, accessMode } = await requireFlipAiAccess(db, session);
    await ensureSchema(db);
    const [appearanceReady, actionCapabilitiesReady] = await Promise.all([
      appearanceSchemaReady(db),
      actionCapabilitiesSchemaReady(db),
    ]);
    const [agents, pipelines, rotations, knowledge] = await Promise.all([
      selectAgents(db, tenantId),
      db.pipeline.findMany({ where: { tenantId, isArchived: false }, orderBy: { name: 'asc' }, select: {
        id: true, name: true, stages: { where: { isArchived: false }, orderBy: { orderIndex: 'asc' }, select: { id: true, name: true } },
      } }),
      db.leadAssignmentRotation.findMany({
        where: { tenantId, form: { tenantId, isActive: true, pipeline: { isArchived: false } } },
        orderBy: { form: { name: 'asc' } },
        select: { id: true, isEnabled: true, form: { select: { name: true, pipelineId: true } } },
      }),
      selectKnowledgeSummaries(db, tenantId),
    ]);
    const publications = await Promise.all(agents.map((agent) =>
      inspectAgentPublicationReadiness(db, tenantId, agent.id)));
    return {
      accessMode,
      appearanceReady,
      actionCapabilitiesReady,
      agents: agents.map((agent, index) => ({ ...agent, updatedAt: agent.updatedAt.toISOString(),
        knowledge: knowledge.get(agent.id) || null, publication: publications[index] })),
      pipelines,
      rotations: rotations.map((rotation) => ({
        id: rotation.id,
        name: rotation.form.name,
        pipelineId: rotation.form.pipelineId,
        enabled: rotation.isEnabled,
      })),
    };
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
    const [appearanceReady, actionCapabilitiesReady] = await Promise.all([
      appearanceSchemaReady(db),
      actionCapabilitiesSchemaReady(db),
    ]);
    if (!appearanceReady && (input.avatarUrl || input.chatBackgroundColor
      || input.userMessageColor || input.sendButtonColor)) {
      throw new FlipAiError('FLIP_AI_APPEARANCE_SCHEMA_NOT_READY', 503,
        'A personalização visual está em preparação. Tente novamente após a atualização segura do banco.');
    }
    if (!actionCapabilitiesReady && hasAnyFlipAiActionCapability(input.actionCapabilities)) {
      throw new FlipAiError('FLIP_AI_ACTION_CAPABILITIES_SCHEMA_NOT_READY', 503,
        'As capacidades de atendimento estão em preparação. Tente novamente após a atualização segura do banco.');
    }
    await db.$queryRaw(Prisma.sql`SELECT id FROM tenants WHERE id = ${tenantId} FOR UPDATE`);
    const id = operation.kind === 'create' ? operation.requestId : operation.id;
    const existing = (await selectAgents(db, tenantId, id))[0];
    if (operation.kind === 'create' && existing) {
      const same = (Object.keys(input) as Array<keyof AgentDraftInput>)
        .every((key) => key === 'actionCapabilities'
          ? JSON.stringify(existing.actionCapabilities) === JSON.stringify(input.actionCapabilities)
          : existing[key] === input[key]);
      if (!same) throw new FlipAiError('REQUEST_CONFLICT', 409, 'Esta solicitação já foi salva com outros dados. Atualize a lista.');
      const knowledge = await selectKnowledgeSummaries(db, tenantId);
      return { ...existing, updatedAt: existing.updatedAt.toISOString(), knowledge: knowledge.get(existing.id) || null,
        publication: await inspectAgentPublicationReadiness(db, tenantId, existing.id) };
    }
    if (operation.kind === 'update' && !existing) throw new FlipAiError('AGENT_NOT_FOUND', 404, 'Atendente não encontrado.');
    await validateDestination(db, tenantId, input);
    if (operation.kind === 'create') {
      if (appearanceReady && actionCapabilitiesReady) {
        await db.$executeRaw(Prisma.sql`INSERT INTO flip_ai_agents
          (id, tenant_id, name, description, primary_color, avatar_url, chat_background_color,
           user_message_color, send_button_color, action_capabilities, style, pipeline_id, initial_stage_id, rotation_id,
           status, version, created_by, created_at, updated_at)
          VALUES (${id}, ${tenantId}, ${input.name}, ${input.description}, ${input.primaryColor}, ${input.avatarUrl},
            ${input.chatBackgroundColor}, ${input.userMessageColor}, ${input.sendButtonColor},
            ${JSON.stringify(input.actionCapabilities)}::jsonb, ${input.style},
            ${input.pipelineId}, ${input.initialStageId}, ${input.rotationId}, 'draft', 1, ${userId}, NOW(), NOW())`);
      } else if (appearanceReady) {
        await db.$executeRaw(Prisma.sql`INSERT INTO flip_ai_agents
          (id, tenant_id, name, description, primary_color, avatar_url, chat_background_color,
           user_message_color, send_button_color, style, pipeline_id, initial_stage_id, rotation_id,
           status, version, created_by, created_at, updated_at)
          VALUES (${id}, ${tenantId}, ${input.name}, ${input.description}, ${input.primaryColor}, ${input.avatarUrl},
            ${input.chatBackgroundColor}, ${input.userMessageColor}, ${input.sendButtonColor}, ${input.style},
            ${input.pipelineId}, ${input.initialStageId}, ${input.rotationId}, 'draft', 1, ${userId}, NOW(), NOW())`);
      } else {
        await db.$executeRaw(Prisma.sql`INSERT INTO flip_ai_agents
          (id, tenant_id, name, description, primary_color, style, pipeline_id, initial_stage_id, rotation_id,
           status, version, created_by, created_at, updated_at)
          VALUES (${id}, ${tenantId}, ${input.name}, ${input.description}, ${input.primaryColor}, ${input.style},
            ${input.pipelineId}, ${input.initialStageId}, ${input.rotationId}, 'draft', 1, ${userId}, NOW(), NOW())`);
      }
      await db.$executeRaw(Prisma.sql`INSERT INTO flip_ai_endpoints (id, tenant_id, agent_id, slug, created_at, updated_at)
        VALUES (${randomUUID()}, ${tenantId}, ${id}, ${input.slug}, NOW(), NOW())`);
    } else {
      const changed = appearanceReady && actionCapabilitiesReady
        ? await db.$executeRaw(Prisma.sql`UPDATE flip_ai_agents SET name = ${input.name},
            description = ${input.description}, primary_color = ${input.primaryColor}, avatar_url = ${input.avatarUrl},
            chat_background_color = ${input.chatBackgroundColor}, user_message_color = ${input.userMessageColor},
            send_button_color = ${input.sendButtonColor},
            action_capabilities = ${JSON.stringify(input.actionCapabilities)}::jsonb,
            style = ${input.style}, pipeline_id = ${input.pipelineId},
            initial_stage_id = ${input.initialStageId}, rotation_id = ${input.rotationId},
            version = version + 1, updated_at = NOW()
            WHERE id = ${id} AND tenant_id = ${tenantId} AND status IN ('draft', 'published')
              AND version = ${operation.version}`)
        : appearanceReady
        ? await db.$executeRaw(Prisma.sql`UPDATE flip_ai_agents SET name = ${input.name},
            description = ${input.description}, primary_color = ${input.primaryColor}, avatar_url = ${input.avatarUrl},
            chat_background_color = ${input.chatBackgroundColor}, user_message_color = ${input.userMessageColor},
            send_button_color = ${input.sendButtonColor}, style = ${input.style}, pipeline_id = ${input.pipelineId},
            initial_stage_id = ${input.initialStageId}, rotation_id = ${input.rotationId},
            version = version + 1, updated_at = NOW()
            WHERE id = ${id} AND tenant_id = ${tenantId} AND status IN ('draft', 'published')
              AND version = ${operation.version}`)
        : await db.$executeRaw(Prisma.sql`UPDATE flip_ai_agents SET name = ${input.name},
            description = ${input.description}, primary_color = ${input.primaryColor}, style = ${input.style},
            pipeline_id = ${input.pipelineId}, initial_stage_id = ${input.initialStageId},
            rotation_id = ${input.rotationId}, version = version + 1, updated_at = NOW()
            WHERE id = ${id} AND tenant_id = ${tenantId} AND status IN ('draft', 'published')
              AND version = ${operation.version}`);
      if (changed !== 1) throw new FlipAiError('VERSION_CONFLICT', 409, 'Este atendente mudou em outra sessão. Atualize a lista antes de editar.');
      await db.$executeRaw(Prisma.sql`UPDATE flip_ai_endpoints SET slug = ${input.slug}, updated_at = NOW()
        WHERE agent_id = ${id} AND tenant_id = ${tenantId}`);
    }
    await db.auditLog.create({ data: { tenantId, userId, entityType: 'flip_ai_agent', entityId: id,
      action: operation.kind === 'create' ? 'created' : 'updated',
      metadata: {
        status: operation.kind === 'create' ? 'draft' : existing?.status,
        actionCapabilities: input.actionCapabilities,
      } } });
    const saved = (await selectAgents(db, tenantId, id))[0];
    if (!saved) throw new FlipAiError('AGENT_NOT_FOUND', 500, 'Não foi possível confirmar o atendente salvo.');
    const knowledge = await selectKnowledgeSummaries(db, tenantId);
    return { ...saved, updatedAt: saved.updatedAt.toISOString(), knowledge: knowledge.get(saved.id) || null,
      publication: await inspectAgentPublicationReadiness(db, tenantId, saved.id) };
  });
}
