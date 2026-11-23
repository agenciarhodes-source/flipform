import 'server-only';

import { prisma } from '@/lib/prisma';
import { assignLeadByRotationId } from '@/lib/lead-assignment';
import { createUrgentTeamTask } from '@/lib/tasks/team-task';
import { videoCallTask } from './video-call-rules';

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://app.flipform.com.br';
/** The reminder shows at once: the customer is waiting for the call. */
const DUE_MINUTES = 5;

/** The queue (rodízio) of the AI attendant, when it has one. */
async function agentRotationId(tenantId: string, agentId: string) {
  const rows = await prisma.$queryRaw<Array<{ rotation_id: string | null }>>`
    SELECT rotation_id FROM flip_ai_agents WHERE id = ${agentId} AND tenant_id = ${tenantId}`.catch(() => []);
  return rows[0]?.rotation_id || null;
}

/**
 * The customer asked for a video call. The AI sends nothing: it stops answering in the conversation
 * (until a person hands it back) and creates an urgent task with an on-screen reminder for the
 * lead's attendant. Without one, the next attendant of the queue (rodízio) of the AI takes the lead
 * and the conversation; without a queue, the managers, or else the owners, get the task.
 * A second request does not repeat it.
 */
export async function handOffForVideoCall(input: { tenantId: string; conversationId: string; agentId: string }) {
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

  let assignee = conversation.lead?.assignedTo || conversation.assignedTo || null;
  let fromQueue = false;
  if (!assignee) {
    const rotationId = await agentRotationId(input.tenantId, input.agentId);
    if (rotationId) {
      assignee = await prisma.$transaction(async (tx) => {
        const next = await assignLeadByRotationId({ tenantId: input.tenantId, rotationId, tx });
        if (!next.assignedTo) return null;
        // The one who calls becomes the responsible, as when a lead arrives by the queue.
        if (conversation.leadId) {
          await tx.lead.updateMany({ where: { id: conversation.leadId, tenantId: input.tenantId, assignedTo: null }, data: { assignedTo: next.assignedTo } });
        }
        await tx.conversation.updateMany({ where: { id: conversation.id, tenantId: input.tenantId, assignedTo: null }, data: { assignedTo: next.assignedTo } });
        return next.assignedTo;
      }).catch(() => null);
      fromQueue = Boolean(assignee);
    }
  }

  const customerName = (conversation.lead?.name || conversation.externalContactIdentity?.displayName || 'Cliente').trim();
  const task = videoCallTask({ customerName, conversationId: conversation.id, leadId: conversation.leadId, appUrl: APP_URL() });
  const recipients = await createUrgentTeamTask({
    tenantId: input.tenantId,
    leadId: conversation.leadId,
    assignee,
    title: task.title,
    description: task.description,
    dueInMinutes: DUE_MINUTES,
  });
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId, userId: null, entityType: 'conversation', entityId: conversation.id,
      action: 'whatsapp_ai.video_call_handoff', metadata: { recipients, assignee, fromQueue },
    },
  }).catch(() => undefined);
  return { handedOff: true, recipients };
}
