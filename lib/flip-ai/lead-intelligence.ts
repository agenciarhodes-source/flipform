import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  buildFlipAiLeadIntelligenceSnapshot,
  parseConversationDecision,
  type FlipAiLeadIntelligenceSnapshot,
} from './lead-intelligence-policy';

type DecisionRow = {
  id: string;
  conversationId: string;
  decision: Prisma.JsonValue | null;
  createdAt: Date;
};

export async function getFlipAiLeadIntelligence(input: {
  tenantId: string;
  leadId: string;
}): Promise<FlipAiLeadIntelligenceSnapshot | null> {
  const rows = await prisma.$queryRaw<DecisionRow[]>(Prisma.sql`
    SELECT
      e.id,
      e.conversation_id AS "conversationId",
      e.metadata->'decision' AS decision,
      e.created_at AS "createdAt"
    FROM flip_ai_usage_events e
    INNER JOIN conversations c
      ON c.tenant_id = e.tenant_id
      AND c.id = e.conversation_id
    WHERE e.tenant_id = ${input.tenantId}
      AND c.lead_id = ${input.leadId}
      AND e.operation = 'conversation_decision'
      AND e.provider = 'typesafe'
      AND e.status = 'confirmed'
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT 2
  `);

  const currentRow = rows[0];
  if (!currentRow) return null;
  const decision = parseConversationDecision(currentRow.decision);
  if (!decision) return null;

  const previousDecision = rows[1]
    ? parseConversationDecision(rows[1].decision)
    : null;

  return buildFlipAiLeadIntelligenceSnapshot({
    decision,
    previousDecision,
    updatedAt: currentRow.createdAt,
    conversationId: currentRow.conversationId,
    usageEventId: currentRow.id,
  });
}
