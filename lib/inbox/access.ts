import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type InboxSessionScope = {
  tenantId: string;
  userId: string;
  role: string;
};

export function getInboxConversationWhere(session: InboxSessionScope): Prisma.ConversationWhereInput {
  const tenantScope: Prisma.ConversationWhereInput = { tenantId: session.tenantId };

  if (session.role !== 'agent') return tenantScope;

  return {
    ...tenantScope,
    OR: [
      { assignedTo: session.userId },
      { lead: { is: { assignedTo: session.userId } } },
    ],
  };
}

export async function findAccessibleInboxConversation(session: InboxSessionScope, conversationId: string) {
  const id = conversationId.trim();
  if (!id) return null;

  return prisma.conversation.findFirst({
    where: {
      id,
      ...getInboxConversationWhere(session),
    },
    include: {
      externalContactIdentity: {
        select: {
          id: true,
          externalUserId: true,
          username: true,
          displayName: true,
          phone: true,
          email: true,
        },
      },
      lead: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          assignedTo: true,
        },
      },
      assignee: {
        select: { id: true, name: true },
      },
    },
  });
}
