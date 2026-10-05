import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { normalizeHostname } from '@/lib/host-routing';
import { FLIP_AI_EMBEDDING_MODEL } from './openai-embeddings';
import { isFlipAiPilotTenant } from './pilot-access';
import { canServeFlipAiPilot, canServeFlipAiPublic } from './policy';
import { loadFlipAiAgentActionCapabilities } from './action-capabilities-server';
import type { FlipAiActionCapabilities } from './action-capabilities';

const PUBLIC_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type PublicFlipAiAgent = {
  id: string;
  slug: string;
  name: string;
  primaryColor: string;
  avatarUrl?: string | null;
  chatBackgroundColor?: string | null;
  userMessageColor?: string | null;
  sendButtonColor?: string | null;
  style: string;
  tenantName: string;
  tenantLogoUrl: string | null;
  knowledgeRevision: number;
};

async function resolveAgentAppearance(input: { tenantId: string; agentId: string }) {
  const rows = await prisma.$queryRaw<Array<{
    avatarUrl: string | null;
    chatBackgroundColor: string | null;
    userMessageColor: string | null;
    sendButtonColor: string | null;
  }>>(Prisma.sql`
    SELECT to_jsonb(agent)->>'avatar_url' AS "avatarUrl",
      to_jsonb(agent)->>'chat_background_color' AS "chatBackgroundColor",
      to_jsonb(agent)->>'user_message_color' AS "userMessageColor",
      to_jsonb(agent)->>'send_button_color' AS "sendButtonColor"
    FROM flip_ai_agents AS agent
    WHERE agent.tenant_id = ${input.tenantId} AND agent.id = ${input.agentId}
    LIMIT 1
  `);
  return rows[0] || {
    avatarUrl: null, chatBackgroundColor: null, userMessageColor: null, sendButtonColor: null,
  };
}

export type PublicFlipAiRuntime = PublicFlipAiAgent & {
  tenantId: string;
  description: string;
  knowledgeIndexId: string;
  pipelineId: string;
  initialStageId: string;
  rotationId: string | null;
  actionCapabilities?: FlipAiActionCapabilities;
};

async function publicSchemaReady(): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ ready: boolean }>>(Prisma.sql`
    SELECT to_regclass('public.flip_ai_agents') IS NOT NULL
      AND to_regclass('public.flip_ai_endpoints') IS NOT NULL
      AND to_regclass('public.flip_ai_knowledge_documents') IS NOT NULL
      AND to_regclass('public.flip_ai_knowledge_indexes') IS NOT NULL
      AND to_regclass('public.flip_ai_conversation_states') IS NOT NULL
      AND to_regclass('public.flip_ai_usage_events') IS NOT NULL
      AND to_regclass('public.flip_ai_rate_limit_buckets') IS NOT NULL
      AND to_regclass('public.flip_ai_qualifications') IS NOT NULL
      AND to_regclass('public.flip_ai_external_sources') IS NOT NULL
      AND to_regclass('public.flip_ai_external_search_cache') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'flip_ai_agents' AND column_name = 'rotation_id'
      )
      AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS ready
  `);
  return Boolean(rows[0]?.ready);
}

export async function resolvePublicFlipAiRuntime(input: {
  slug: string;
  customDomainHost?: string | null;
}): Promise<PublicFlipAiRuntime | null> {
  const slug = input.slug.trim().toLowerCase();
  if (!PUBLIC_SLUG.test(slug) || !(await publicSchemaReady())) return null;

  let tenantId: string | undefined;
  if (input.customDomainHost !== undefined) {
    const host = normalizeHostname(input.customDomainHost);
    if (!host) return null;
    const domain = await prisma.customFormDomain.findFirst({
      where: {
        domain: host,
        status: 'active',
        verificationStatus: 'verified',
        sslStatus: 'active',
      },
      select: { tenantId: true },
    });
    if (!domain) return null;
    tenantId = domain.tenantId;
  }

  const endpoint = await prisma.flipAiEndpoint.findFirst({
    where: { slug, ...(tenantId ? { tenantId } : {}) },
    select: {
      slug: true,
      agent: {
        select: {
          id: true,
          status: true,
          name: true,
          description: true,
          primaryColor: true,
          style: true,
          tenantId: true,
          pipelineId: true,
          initialStageId: true,
          rotationId: true,
          pipeline: { select: { tenantId: true, isArchived: true } },
          initialStage: { select: { pipelineId: true, isArchived: true } },
          rotation: {
            select: {
              tenantId: true,
              isEnabled: true,
              form: { select: { tenantId: true, pipelineId: true, isActive: true } },
            },
          },
          tenant: {
            select: {
              name: true,
              logoUrl: true,
              status: true,
              plan: { select: { slug: true, isActive: true } },
            },
          },
        },
      },
    },
  });
  if (!endpoint || endpoint.agent.status !== 'published') return null;

  const subscription = await prisma.subscription.findFirst({
    where: { tenantId: endpoint.agent.tenantId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      status: true,
      gracePeriodEndsAt: true,
      plan: { select: { slug: true, isActive: true } },
    },
  });
  const billingInput = {
    tenantStatus: endpoint.agent.tenant.status,
    plan: endpoint.agent.tenant.plan,
    subscription,
  };
  const planAccess = canServeFlipAiPublic(billingInput);
  const pilotAccess = isFlipAiPilotTenant(endpoint.agent.tenantId)
    && canServeFlipAiPilot(billingInput);
  if (!planAccess && !pilotAccess) return null;
  if (
    endpoint.agent.pipeline.tenantId !== endpoint.agent.tenantId
    || endpoint.agent.pipeline.isArchived
    || endpoint.agent.initialStage.pipelineId !== endpoint.agent.pipelineId
    || endpoint.agent.initialStage.isArchived
  ) return null;

  const document = await prisma.flipAiKnowledgeDocument.findFirst({
    where: {
      tenantId: endpoint.agent.tenantId,
      sourceKey: 'master',
      knowledgeBase: { agentId: endpoint.agent.id },
    },
    select: { id: true, currentRevision: true, currentHash: true },
  });
  if (!document) return null;

  const index = await prisma.flipAiKnowledgeIndex.findFirst({
    where: {
      tenantId: endpoint.agent.tenantId,
      agentId: endpoint.agent.id,
      documentId: document.id,
      revision: document.currentRevision,
      contentHash: document.currentHash,
      embeddingModel: FLIP_AI_EMBEDDING_MODEL,
      status: 'completed',
    },
    select: { id: true },
  });
  if (!index) return null;
  const [appearance, actionCapabilities] = await Promise.all([
    resolveAgentAppearance({
      tenantId: endpoint.agent.tenantId,
      agentId: endpoint.agent.id,
    }),
    loadFlipAiAgentActionCapabilities({
      tenantId: endpoint.agent.tenantId,
      agentId: endpoint.agent.id,
    }),
  ]);

  return {
    id: endpoint.agent.id,
    slug: endpoint.slug,
    name: endpoint.agent.name,
    description: endpoint.agent.description,
    primaryColor: endpoint.agent.primaryColor,
    ...appearance,
    style: endpoint.agent.style,
    tenantId: endpoint.agent.tenantId,
    tenantName: endpoint.agent.tenant.name,
    tenantLogoUrl: endpoint.agent.tenant.logoUrl,
    knowledgeRevision: document.currentRevision,
    knowledgeIndexId: index.id,
    pipelineId: endpoint.agent.pipelineId,
    initialStageId: endpoint.agent.initialStageId,
    rotationId: endpoint.agent.rotationId
      && endpoint.agent.rotation?.tenantId === endpoint.agent.tenantId
      && endpoint.agent.rotation.form.tenantId === endpoint.agent.tenantId
      && endpoint.agent.rotation.form.pipelineId === endpoint.agent.pipelineId
      && endpoint.agent.rotation.isEnabled
      && endpoint.agent.rotation.form.isActive
      ? endpoint.agent.rotationId : null,
    actionCapabilities,
  };
}

export async function resolvePublicFlipAiAgent(input: {
  slug: string;
  customDomainHost?: string | null;
}): Promise<PublicFlipAiAgent | null> {
  const runtime = await resolvePublicFlipAiRuntime(input);
  if (!runtime) return null;
  return {
    id: runtime.id,
    slug: runtime.slug,
    name: runtime.name,
    primaryColor: runtime.primaryColor,
    avatarUrl: runtime.avatarUrl,
    chatBackgroundColor: runtime.chatBackgroundColor,
    userMessageColor: runtime.userMessageColor,
    sendButtonColor: runtime.sendButtonColor,
    style: runtime.style,
    tenantName: runtime.tenantName,
    tenantLogoUrl: runtime.tenantLogoUrl,
    knowledgeRevision: runtime.knowledgeRevision,
  };
}
