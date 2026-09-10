import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { normalizeHostname } from '@/lib/host-routing';
import { FLIP_AI_EMBEDDING_MODEL } from './openai-embeddings';
import { canServeFlipAiPublic } from './policy';

const PUBLIC_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type PublicFlipAiAgent = {
  id: string;
  slug: string;
  name: string;
  primaryColor: string;
  style: string;
  tenantName: string;
  tenantLogoUrl: string | null;
  knowledgeRevision: number;
};

async function publicSchemaReady(): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ ready: boolean }>>(Prisma.sql`
    SELECT to_regclass('public.flip_ai_agents') IS NOT NULL
      AND to_regclass('public.flip_ai_endpoints') IS NOT NULL
      AND to_regclass('public.flip_ai_knowledge_documents') IS NOT NULL
      AND to_regclass('public.flip_ai_knowledge_indexes') IS NOT NULL
      AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS ready
  `);
  return Boolean(rows[0]?.ready);
}

export async function resolvePublicFlipAiAgent(input: {
  slug: string;
  customDomainHost?: string | null;
}): Promise<PublicFlipAiAgent | null> {
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
          primaryColor: true,
          style: true,
          tenantId: true,
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
  if (!canServeFlipAiPublic({
    tenantStatus: endpoint.agent.tenant.status,
    plan: endpoint.agent.tenant.plan,
    subscription,
  })) return null;

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

  return {
    id: endpoint.agent.id,
    slug: endpoint.slug,
    name: endpoint.agent.name,
    primaryColor: endpoint.agent.primaryColor,
    style: endpoint.agent.style,
    tenantName: endpoint.agent.tenant.name,
    tenantLogoUrl: endpoint.agent.tenant.logoUrl,
    knowledgeRevision: document.currentRevision,
  };
}
