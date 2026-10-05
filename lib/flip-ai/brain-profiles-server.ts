import 'server-only';
import { prisma } from '@/lib/prisma';
import { parseBrainProfiles, type ParsedBrainProfiles } from './brain-profiles';

export async function loadPublishedBrainProfiles(input: {
  tenantId: string; agentId: string; knowledgeIndexId: string;
}): Promise<ParsedBrainProfiles & { contentHash: string }> {
  const index = await prisma.flipAiKnowledgeIndex.findFirst({
    where: {
      id: input.knowledgeIndexId, tenantId: input.tenantId,
      agentId: input.agentId, status: 'completed',
    },
    select: { contentHash: true, sourceRevision: { select: { content: true } } },
  });
  if (!index) throw new Error('BRAIN_PUBLISHED_INDEX_NOT_FOUND');
  return { ...parseBrainProfiles(index.sourceRevision.content), contentHash: index.contentHash };
}
