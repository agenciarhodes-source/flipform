import 'server-only';

import { prisma } from '@/lib/prisma';
import {
  parseConversationMemorySnapshot,
  type FlipAiConversationMemorySnapshot,
} from './conversation-memory-policy';

type UsageMetadata = {
  memorySnapshot?: unknown;
};

function metadataOf(value: unknown): UsageMetadata {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UsageMetadata
    : {};
}

export async function loadLatestConversationMemory(input: {
  tenantId: string;
  conversationId: string;
  excludeEventId?: string;
}): Promise<FlipAiConversationMemorySnapshot | null> {
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
  return parseConversationMemorySnapshot(metadataOf(event?.metadata).memorySnapshot);
}
