import 'server-only';

import { prisma } from '@/lib/prisma';
import {
  parseAvailabilitySnapshot,
  type FlipAiAvailabilitySnapshot,
} from './availability-policy';

type UsageMetadata = {
  availabilitySnapshot?: unknown;
};

function metadataOf(value: unknown): UsageMetadata {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UsageMetadata
    : {};
}

export async function loadLatestConversationAvailability(input: {
  tenantId: string;
  conversationId: string;
  excludeEventId?: string;
}): Promise<FlipAiAvailabilitySnapshot | null> {
  const event = await prisma.flipAiUsageEvent.findFirst({
    where: {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      operation: 'chat_response',
      status: 'confirmed',
      ...(input.excludeEventId ? { id: { not: input.excludeEventId } } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { metadata: true },
  });
  return parseAvailabilitySnapshot(metadataOf(event?.metadata).availabilitySnapshot);
}
