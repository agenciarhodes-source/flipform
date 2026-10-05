import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  EMPTY_FLIP_AI_ACTION_CAPABILITIES,
  parseFlipAiActionCapabilities,
  type FlipAiActionCapabilities,
} from './action-capabilities';

export async function loadFlipAiAgentActionCapabilities(input: {
  tenantId: string;
  agentId: string;
}): Promise<FlipAiActionCapabilities> {
  const rows = await prisma.$queryRaw<Array<{ actionCapabilities: unknown }>>(Prisma.sql`
    SELECT COALESCE(to_jsonb(a)->'action_capabilities', '{}'::jsonb) AS "actionCapabilities"
    FROM flip_ai_agents a
    WHERE a.tenant_id = ${input.tenantId}
      AND a.id = ${input.agentId}
    LIMIT 1
  `);
  return rows[0]
    ? parseFlipAiActionCapabilities(rows[0].actionCapabilities)
    : { ...EMPTY_FLIP_AI_ACTION_CAPABILITIES };
}
