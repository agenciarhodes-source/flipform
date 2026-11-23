import 'server-only';

import { prisma } from '@/lib/prisma';
import { createUrgentTeamTask } from '@/lib/tasks/team-task';
import { videoCallTask } from './video-call-rules';

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://app.flipform.com.br';
/** The reminder shows at once: the customer is waiting for the call. */
const DUE_MINUTES = 5;

/**
 * The customer asked for a video call: the AI stops answering in the conversation (until a person
 * hands it back) and the lead's attendant (or the conversation's, or else the managers, or the
 * owners) gets an urgent task with an on-screen reminder. A second request does not repeat it.
 */
export async function handOffForVideoCall(input: { tenantId: string; conversationId: string }) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, tenantId: input.tenantId, channel: 'whatsapp' },
    select: {
      id: true, assignedTo: true, leadId: true, aiPausedAt: true, aiPauseReason: true,
      lead: { select: { name: true, assignedTo: true } },
      externalContactIdentity: { select: { displayName: true } },
    },
  });
  if (!conversation) return { handedOff: false, recipients: 0 };
  // Already with the team because of the AI: no second task.
  if (conversation.aiPausedAt && conversation.aiPauseReason === 'ai_handoff') return { handedOff: false, recipients: 0 };

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { aiPausedAt: new Date(), aiPausedBy: null, aiPauseReason: 'ai_handoff' },
  });
  const customerName = (conversation.lead?.name || conversation.externalContactIdentity?.displayName || 'Cliente').trim();
  const task = videoCallTask({ customerName, conversationId: conversation.id, leadId: conversation.leadId, appUrl: APP_URL() });
  const recipients = await createUrgentTeamTask({
    tenantId: input.tenantId,
    leadId: conversation.leadId,
    assignee: conversation.lead?.assignedTo || conversation.assignedTo || null,
    title: task.title,
    description: task.description,
    dueInMinutes: DUE_MINUTES,
  });
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId, userId: null, entityType: 'conversation', entityId: conversation.id,
      action: 'whatsapp_ai.video_call_handoff', metadata: { recipients },
    },
  }).catch(() => undefined);
  return { handedOff: true, recipients };
}
