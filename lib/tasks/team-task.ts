import 'server-only';

import { prisma } from '@/lib/prisma';
import { handoffRecipients } from '@/lib/instagram-ai/handoff-rules';

/**
 * An urgent task for the team, with a reminder on screen: for the given attendant (the lead's or
 * the conversation's), or else the managers, or else the owners. Returns how many were created.
 */
export async function createUrgentTeamTask(input: {
  tenantId: string;
  leadId: string | null;
  assignee: string | null;
  title: string;
  description: string;
  dueInMinutes: number;
}) {
  const members = await prisma.tenantUser.findMany({
    where: { tenantId: input.tenantId },
    select: { userId: true, role: true, status: true },
  });
  const recipients = handoffRecipients({
    conversationAssignee: input.assignee,
    members: members.map((member) => ({ userId: member.userId, role: member.role, active: member.status === 'active' })),
  });
  if (!recipients.length) return 0;
  const due = new Date(Date.now() + input.dueInMinutes * 60_000);
  await prisma.task.createMany({
    data: recipients.map((userId) => ({
      tenantId: input.tenantId, leadId: input.leadId, assignedTo: userId, createdBy: null,
      title: input.title, description: input.description, dueDate: due,
      remindMinutesBefore: Math.min(60, Math.max(5, input.dueInMinutes)), priority: 'high' as const,
    })),
  });
  return recipients.length;
}
