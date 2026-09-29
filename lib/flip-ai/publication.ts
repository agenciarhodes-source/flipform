import 'server-only';

import { Prisma } from '@prisma/client';
import type { SessionPayload } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { FlipAiError, requireFlipAiAccess, type FlipAiDb } from './access';
import { FLIP_AI_EMBEDDING_MODEL } from './openai-embeddings';
import type { AgentPublicationReadiness } from './policy';

type PublicationOptions = { openAiConfigured?: boolean };

function openAiConfigured(options?: PublicationOptions) {
  return options?.openAiConfigured ?? Boolean(process.env.OPENAI_API_KEY?.trim());
}

export async function inspectAgentPublicationReadiness(
  db: FlipAiDb,
  tenantId: string,
  agentId: string,
  options?: PublicationOptions,
): Promise<AgentPublicationReadiness> {
  const agent = await db.flipAiAgent.findFirst({
    where: { id: agentId, tenantId, status: { in: ['draft', 'published'] } },
    select: {
      id: true,
      pipelineId: true,
      initialStageId: true,
      rotationId: true,
      endpoint: { select: { slug: true } },
      pipeline: { select: { tenantId: true, isArchived: true } },
      initialStage: { select: { pipelineId: true, isArchived: true } },
      rotation: {
        select: {
          tenantId: true,
          isEnabled: true,
          form: { select: { tenantId: true, pipelineId: true, isActive: true } },
        },
      },
    },
  });
  if (!agent?.endpoint) throw new FlipAiError('AGENT_NOT_FOUND', 404, 'Atendente não encontrado.');

  const destinationReady = agent.pipeline.tenantId === tenantId
    && !agent.pipeline.isArchived
    && agent.initialStage.pipelineId === agent.pipelineId
    && !agent.initialStage.isArchived
    && (!agent.rotationId || (
      agent.rotation?.tenantId === tenantId
      && agent.rotation.form.tenantId === tenantId
      && agent.rotation.form.pipelineId === agent.pipelineId
      && agent.rotation.isEnabled
      && agent.rotation.form.isActive
    ));

  const document = await db.flipAiKnowledgeDocument.findFirst({
    where: { tenantId, sourceKey: 'master', knowledgeBase: { agentId } },
    select: { id: true, currentRevision: true, currentHash: true },
  });
  const knowledgeReady = document ? Boolean(await db.flipAiKnowledgeIndex.findFirst({
    where: {
      tenantId,
      agentId,
      documentId: document.id,
      revision: document.currentRevision,
      contentHash: document.currentHash,
      embeddingModel: FLIP_AI_EMBEDDING_MODEL,
      status: 'completed',
    },
    select: { id: true },
  })) : false;

  const wallet = await db.$queryRaw<Array<{ ready: boolean }>>(Prisma.sql`
    SELECT to_regclass('public.flip_ai_credit_accounts') IS NOT NULL
      AND to_regclass('public.flip_ai_credit_ledger') IS NOT NULL AS ready
  `);
  const checks: AgentPublicationReadiness['checks'] = [
    {
      key: 'destination',
      label: 'Destino no Kanban',
      ready: destinationReady,
      detail: destinationReady
        ? 'Pipeline, etapa inicial e rodízio estão válidos para esta empresa.'
        : 'Revise o pipeline, a etapa inicial ou o rodízio do atendente.',
    },
    {
      key: 'knowledge',
      label: 'Base de conhecimento',
      ready: knowledgeReady,
      detail: knowledgeReady
        ? 'A revisão atual do Markdown Mestre está indexada.'
        : 'Conclua a indexação da revisão atual do Markdown Mestre.',
    },
    {
      key: 'openai',
      label: 'OpenAI',
      ready: openAiConfigured(options),
      detail: openAiConfigured(options)
        ? 'A credencial do provedor está configurada no servidor.'
        : 'A credencial da OpenAI não está configurada no servidor.',
    },
    {
      key: 'wallet',
      label: 'Carteira de créditos',
      ready: Boolean(wallet[0]?.ready),
      detail: wallet[0]?.ready
        ? 'A estrutura de saldo e ledger está disponível.'
        : 'A estrutura da carteira ainda não está disponível.',
    },
  ];
  return {
    ready: checks.every((check) => check.ready),
    publicPath: `/chat/${agent.endpoint.slug}`,
    checks,
  };
}

export async function changeAgentPublication(
  session: SessionPayload,
  agentId: string,
  input: { action: 'publish' | 'unpublish'; version: number },
  options?: PublicationOptions,
) {
  return prisma.$transaction(async (db) => {
    const { tenantId, userId } = await requireFlipAiAccess(db, session);
    await db.$queryRaw(Prisma.sql`SELECT id FROM tenants WHERE id = ${tenantId} FOR UPDATE`);
    const rows = await db.$queryRaw<Array<{ id: string; status: string; version: number }>>(Prisma.sql`
      SELECT id, status, version FROM flip_ai_agents
      WHERE id = ${agentId} AND tenant_id = ${tenantId}
        AND status IN ('draft', 'published')
      FOR UPDATE
    `);
    const agent = rows[0];
    if (!agent) throw new FlipAiError('AGENT_NOT_FOUND', 404, 'Atendente não encontrado.');
    const target = input.action === 'publish' ? 'published' : 'draft';
    if (agent.status === target) {
      return {
        status: target,
        version: agent.version,
        publication: await inspectAgentPublicationReadiness(db, tenantId, agentId, options),
        reused: true,
      };
    }
    if (agent.version !== input.version) {
      throw new FlipAiError('VERSION_CONFLICT', 409, 'Este atendente mudou em outra sessão. Atualize a lista.');
    }
    const publication = await inspectAgentPublicationReadiness(db, tenantId, agentId, options);
    if (input.action === 'publish' && !publication.ready) {
      throw new FlipAiError('AGENT_NOT_READY', 409,
        'Conclua todos os itens de prontidão antes de publicar o atendente.');
    }
    const changed = await db.flipAiAgent.updateMany({
      where: { id: agentId, tenantId, status: agent.status, version: input.version },
      data: { status: target, version: { increment: 1 } },
    });
    if (changed.count !== 1) {
      throw new FlipAiError('VERSION_CONFLICT', 409, 'Este atendente mudou em outra sessão. Atualize a lista.');
    }
    await db.auditLog.create({
      data: {
        tenantId,
        userId,
        entityType: 'flip_ai_agent',
        entityId: agentId,
        action: input.action === 'publish' ? 'published' : 'unpublished',
        metadata: { previousStatus: agent.status, nextStatus: target },
      },
    });
    return {
      status: target,
      version: input.version + 1,
      publication,
      reused: false,
    };
  });
}
