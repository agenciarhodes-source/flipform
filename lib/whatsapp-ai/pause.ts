import 'server-only';

import { prisma } from '@/lib/prisma';

/**
 * Human and AI never answer the same conversation at once. The AI is paused in a conversation
 * when someone takes it over or a person of the team answers it (in FlipForm or on the phone),
 * and it only comes back when someone hands it back, or after the hours set for the number.
 */
export const AI_PAUSE_REASONS = ['manual', 'human_reply_system', 'human_reply_phone'] as const;
export type AiPauseReason = (typeof AI_PAUSE_REASONS)[number];

export async function pauseConversationAi(input: {
  tenantId: string;
  conversationId: string;
  userId: string | null;
  reason: AiPauseReason;
}) {
  const current = await prisma.conversation.findFirst({
    where: { id: input.conversationId, tenantId: input.tenantId },
    select: { id: true, aiPausedAt: true },
  });
  if (!current) return { changed: false };

  // A new human reply moves the pause forward, so an automatic return counts from the last one.
  await prisma.conversation.update({
    where: { id: current.id },
    data: { aiPausedAt: new Date(), aiPausedBy: input.userId, aiPauseReason: input.reason },
  });
  if (current.aiPausedAt) return { changed: false };

  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      entityType: 'conversation',
      entityId: current.id,
      action: 'whatsapp_ai.paused',
      metadata: { reason: input.reason },
    },
  }).catch(() => undefined);
  return { changed: true };
}

export async function resumeConversationAi(input: { tenantId: string; conversationId: string; userId: string }) {
  const updated = await prisma.conversation.updateMany({
    where: { id: input.conversationId, tenantId: input.tenantId, aiPausedAt: { not: null } },
    data: { aiPausedAt: null, aiPausedBy: null, aiPauseReason: null },
  });
  if (!updated.count) return { changed: false };
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      entityType: 'conversation',
      entityId: input.conversationId,
      action: 'whatsapp_ai.resumed',
      metadata: { reason: 'manual' },
    },
  }).catch(() => undefined);
  return { changed: true };
}

/** Whether the AI is paused in a conversation now, given the return time set for the number. */
export function isConversationAiPaused(
  conversation: { aiPausedAt: Date | null },
  resumeAfterHours: number | null,
  now = new Date(),
) {
  if (!conversation.aiPausedAt) return false;
  if (!resumeAfterHours) return true;
  return now.getTime() - conversation.aiPausedAt.getTime() < resumeAfterHours * 3_600_000;
}

/** Whether any connected number of the company has the AI switched on. */
export async function isWhatsAppAiEnabledForTenant(tenantId: string) {
  const enabled = await prisma.tenantWhatsAppAiSettings.findFirst({
    where: { tenantId, enabled: true, connection: { status: 'connected' } },
    select: { resumeAfterHours: true },
  }).catch(() => null);
  return enabled ? { enabled: true as const, resumeAfterHours: enabled.resumeAfterHours } : { enabled: false as const, resumeAfterHours: null };
}
