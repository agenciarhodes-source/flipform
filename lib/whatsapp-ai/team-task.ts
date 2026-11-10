import 'server-only';

import { prisma } from '@/lib/prisma';
import { createUrgentTeamTask } from '@/lib/tasks/team-task';
import { teamTaskContent, teamTaskKey, URGENT_TASK_DUE_MINUTES } from './team-task-rules';

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://app.flipform.com.br';
/** The same request in the same conversation within this time does not create a second task. */
const REPEAT_WINDOW_MS = 6 * 3_600_000;

/**
 * The WhatsApp attendant asked for something a person must do. An urgent task (1 hour) goes to the
 * lead's attendant (or the conversation's, or the managers, or the owners). The conversation goes on.
 */
export async function createWhatsAppTeamTask(input: { tenantId: string; conversationId: string; what: string; urgent?: boolean }) {
  const key = teamTaskKey(input.what);
  const recent = await prisma.auditLog.findMany({
    where: {
      tenantId: input.tenantId, entityType: 'conversation', entityId: input.conversationId,
      action: 'whatsapp_ai.team_task', createdAt: { gte: new Date(Date.now() - REPEAT_WINDOW_MS) },
    },
    select: { metadata: true },
  });
  if (recent.some((row) => (row.metadata as { key?: unknown } | null)?.key === key)) return { created: 0, repeated: true };

  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, tenantId: input.tenantId },
    select: {
      assignedTo: true, leadId: true,
      lead: { select: { name: true, assignedTo: true } },
      externalContactIdentity: { select: { displayName: true } },
    },
  });
  if (!conversation) return { created: 0, repeated: false };
  const customerName = (conversation.lead?.name || conversation.externalContactIdentity?.displayName || 'Cliente').trim();
  const content = teamTaskContent({ customerName, what: input.what, conversationId: input.conversationId, leadId: conversation.leadId, appUrl: APP_URL(), urgent: input.urgent });
  const created = await createUrgentTeamTask({
    tenantId: input.tenantId,
    leadId: conversation.leadId,
    assignee: conversation.lead?.assignedTo || conversation.assignedTo || null,
    title: content.title,
    description: content.description,
    dueInMinutes: input.urgent ? URGENT_TASK_DUE_MINUTES : 60,
  });
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId, userId: null, entityType: 'conversation', entityId: input.conversationId,
      action: 'whatsapp_ai.team_task', metadata: { key, recipients: created, urgent: !!input.urgent },
    },
  }).catch(() => undefined);
  return { created, repeated: false };
}
