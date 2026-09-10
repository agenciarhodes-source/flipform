import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { FLIP_AI_EMBEDDING_DIMENSIONS } from './openai-embeddings';

export type PublicKnowledgeHit = {
  id: string;
  heading: string | null;
  content: string;
  score: number;
};

export async function searchPublicKnowledge(input: {
  tenantId: string;
  agentId: string;
  knowledgeIndexId: string;
  embedding: number[];
  limit?: number;
}): Promise<PublicKnowledgeHit[]> {
  if (input.embedding.length !== FLIP_AI_EMBEDDING_DIMENSIONS ||
    input.embedding.some((value) => !Number.isFinite(value))) {
    throw new Error('INVALID_PUBLIC_QUERY_EMBEDDING');
  }
  const take = Math.max(1, Math.min(5, Math.trunc(input.limit || 5)));
  const vector = `[${input.embedding.join(',')}]`;
  const rows = await prisma.$queryRaw<PublicKnowledgeHit[]>(Prisma.sql`
    SELECT c.id, c.heading, c.content,
      1 - (c.embedding <=> ${vector}::vector) AS score
    FROM flip_ai_knowledge_chunks c
    JOIN flip_ai_knowledge_indexes i
      ON i.id = c.index_id AND i.tenant_id = c.tenant_id
    WHERE c.tenant_id = ${input.tenantId}
      AND i.agent_id = ${input.agentId}
      AND i.id = ${input.knowledgeIndexId}
      AND i.status = 'completed'
      AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${vector}::vector
    LIMIT ${take}
  `);
  return rows.filter((row) => Number.isFinite(row.score) && row.score >= 0.2);
}
