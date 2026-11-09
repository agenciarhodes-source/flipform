import 'server-only';

import { prisma } from '@/lib/prisma';
import { handoffRecipients, handoffTask, INSTAGRAM_HANDOFF_PAUSE_REASON } from './handoff-rules';

/**
 * The Instagram attendant hands a conversation to the team: the AI stops answering in it (until a
 * person hands it back) and an urgent task with a reminder goes to the conversation's attendant,
 * or to the managers, or to the owners. Global for every company.
 */
export async function handOffInstagramConversation(input: { tenantId: string; conversationId: string; label: string | null }) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, tenantId: input.tenantId, provider: 'meta', channel: 'instagram' },
    select: {
      id: true, assignedTo: true, leadId: true, aiPauseReason: true, aiPausedAt: true,
      externalContactIdentity: { select: { displayName: true, username: true } },
    },
  });
  if (!conversation) return { handedOff: false };

  // Already with the team because of the AI: no second task.
  if (conversation.aiPausedAt && conversation.aiPauseReason === INSTAGRAM_HANDOFF_PAUSE_REASON) return { handedOff: false };

  const now = new Date();
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { aiPausedAt: now, aiPausedBy: null, aiPauseReason: INSTAGRAM_HANDOFF_PAUSE_REASON },
  });

  const [members, recent] = await Promise.all([
    prisma.tenantUser.findMany({
      where: { tenantId: input.tenantId, role: { in: ['owner', 'manager', 'admin', 'agent'] } },
      orderBy: { createdAt: 'asc' },
      select: { userId: true, role: true, status: true },
    }),
    prisma.message.findMany({
      where: { tenantId: input.tenantId, conversationId: conversation.id, direction: 'inbound', type: 'text' },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { text: true },
    }),
  ]);
  const recipients = handoffRecipients({
    conversationAssignee: conversation.assignedTo,
    members: members.map((member) => ({ userId: member.userId, role: member.role, active: member.status === 'active' })),
  });
  const identity = conversation.externalContactIdentity;
  const contactLabel = input.label || (identity?.username ? `@${identity.username}` : identity?.displayName) || 'um cliente';
  const task = handoffTask({
    contactLabel,
    lastMessages: recent.reverse().map((message) => message.text || ''),
    conversationId: conversation.id,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://app.flipform.com.br',
  });

  if (recipients.length) {
    await prisma.task.createMany({
      data: recipients.map((userId) => ({
        tenantId: input.tenantId,
        leadId: conversation.leadId,
        assignedTo: userId,
        createdBy: null,
        title: task.title,
        description: task.description,
        dueDate: now,
        remindMinutesBefore: 5,
        priority: 'high' as const,
      })),
    });
  }
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      userId: null,
      entityType: 'conversation',
      entityId: conversation.id,
      action: 'instagram_ai.handed_off',
      metadata: { recipients: recipients.length, reason: INSTAGRAM_HANDOFF_PAUSE_REASON },
    },
  }).catch(() => undefined);
  return { handedOff: true, recipients: recipients.length };
}
