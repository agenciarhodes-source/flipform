import 'server-only';

import { prisma } from '@/lib/prisma';

export type InboxClaimResult = 'claimed' | 'already_mine' | 'taken';

/**
 * Gives a conversation that nobody has to this user. Only a conversation still free is taken,
 * so two attendants answering at once never take it from each other. A free lead goes too.
 */
export async function claimInboxConversation(input: { tenantId: string; userId: string; conversationId: string }): Promise<InboxClaimResult> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, tenantId: input.tenantId },
    select: { id: true, assignedTo: true, leadId: true, lead: { select: { assignedTo: true } } },
  });
  if (!conversation) return 'taken';
  if (conversation.assignedTo === input.userId || conversation.lead?.assignedTo === input.userId) return 'already_mine';
  if (conversation.assignedTo || conversation.lead?.assignedTo) return 'taken';

  const updated = await prisma.conversation.updateMany({
    where: { id: conversation.id, tenantId: input.tenantId, assignedTo: null },
    data: { assignedTo: input.userId },
  });
  if (!updated.count) return 'taken';
  if (conversation.leadId) {
    await prisma.lead.updateMany({
      where: { id: conversation.leadId, tenantId: input.tenantId, assignedTo: null },
      data: { assignedTo: input.userId },
    });
  }
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId, userId: input.userId, entityType: 'conversation', entityId: conversation.id,
      action: 'INBOX_CONVERSATION_CLAIMED', metadata: { leadId: conversation.leadId },
    },
  }).catch(() => undefined);
  return 'claimed';
}
