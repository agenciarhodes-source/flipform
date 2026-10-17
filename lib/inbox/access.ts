import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { seesUnassignedConversations } from '@/lib/inbox/unassigned-viewers';

export type InboxSessionScope = {
  tenantId: string;
  userId: string;
  role: string;
  /** Chosen in Integrações to also see the conversations nobody has yet. */
  seesUnassigned?: boolean;
};

/** A conversation nobody has: not given to anyone and without a lead that is someone's. */
export const UNASSIGNED_CONVERSATION_WHERE: Prisma.ConversationWhereInput = {
  assignedTo: null,
  OR: [{ leadId: null }, { lead: { is: { assignedTo: null } } }],
};

/** The session with whether this attendant also sees the conversations nobody has. */
export async function withInboxScope<T extends InboxSessionScope>(session: T): Promise<T> {
  if (session.role !== 'agent' || session.seesUnassigned !== undefined) return session;
  return { ...session, seesUnassigned: await seesUnassignedConversations(session) } as T;
}

export function getInboxConversationWhere(session: InboxSessionScope): Prisma.ConversationWhereInput {
  const tenantScope: Prisma.ConversationWhereInput = { tenantId: session.tenantId };

  if (session.role !== 'agent') return tenantScope;

  return {
    ...tenantScope,
    OR: [
      { assignedTo: session.userId },
      { lead: { is: { assignedTo: session.userId } } },
      ...(session.seesUnassigned ? [UNASSIGNED_CONVERSATION_WHERE] : []),
    ],
  };
}

export async function findAccessibleInboxConversation(session: InboxSessionScope, conversationId: string) {
  const id = conversationId.trim();
  if (!id) return null;

  return prisma.conversation.findFirst({
    where: {
      id,
      ...getInboxConversationWhere(await withInboxScope(session)),
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
          assignedUser: { select: { id: true, name: true } },
        },
      },
      assignee: {
        select: { id: true, name: true },
      },
    },
  });
}
