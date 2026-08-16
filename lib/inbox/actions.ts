import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getInboxConversationWhere, type InboxSessionScope } from '@/lib/inbox/access';

export type InboxActionErrorCode =
  | 'NOT_FOUND'
  | 'LEAD_NOT_FOUND'
  | 'ALREADY_LINKED'
  | 'FORBIDDEN'
  | 'INVALID_ASSIGNEE'
  | 'INVALID_STATUS';

export class InboxActionError extends Error {
  constructor(
    public readonly code: InboxActionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'InboxActionError';
  }
}

function required(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new InboxActionError('NOT_FOUND', `${field} is required`);
  return normalized;
}

async function lockConversation(
  tx: Prisma.TransactionClient,
  tenantId: string,
  conversationId: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM public.conversations
    WHERE id = ${conversationId} AND tenant_id = ${tenantId}
    FOR UPDATE
  `;
  if (rows.length !== 1) throw new InboxActionError('NOT_FOUND', 'Conversation not found');
}

async function lockExternalIdentity(
  tx: Prisma.TransactionClient,
  tenantId: string,
  identityId: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string; lead_id: string | null }>>`
    SELECT id, lead_id
    FROM public.external_contact_identities
    WHERE id = ${identityId} AND tenant_id = ${tenantId}
    FOR UPDATE
  `;
  if (rows.length !== 1) throw new InboxActionError('NOT_FOUND', 'External contact identity not found');
  return rows[0];
}

async function findScopedConversation(
  tx: Prisma.TransactionClient,
  session: InboxSessionScope,
  conversationId: string,
) {
  const conversation = await tx.conversation.findFirst({
    where: {
      id: conversationId,
      ...getInboxConversationWhere(session),
    },
    select: {
      id: true,
      tenantId: true,
      leadId: true,
      assignedTo: true,
      status: true,
      externalContactIdentityId: true,
    },
  });
  if (!conversation) throw new InboxActionError('NOT_FOUND', 'Conversation not found in inbox scope');
  return conversation;
}

export async function linkInboxConversationToLead(input: {
  session: InboxSessionScope;
  conversationId: string;
  leadId: string;
}) {
  const conversationId = required(input.conversationId, 'conversationId');
  const leadId = required(input.leadId, 'leadId');

  return prisma.$transaction(async (tx) => {
    await lockConversation(tx, input.session.tenantId, conversationId);
    const conversation = await findScopedConversation(tx, input.session, conversationId);
    const identity = await lockExternalIdentity(
      tx,
      input.session.tenantId,
      conversation.externalContactIdentityId,
    );

    const lead = await tx.lead.findFirst({
      where: {
        id: leadId,
        tenantId: input.session.tenantId,
        ...(input.session.role === 'agent' ? { assignedTo: input.session.userId } : {}),
      },
      select: { id: true, name: true, assignedTo: true },
    });
    if (!lead) throw new InboxActionError('LEAD_NOT_FOUND', 'Lead not found in current scope');

    const existingLeadIds = [conversation.leadId, identity.lead_id].filter(
      (value): value is string => Boolean(value),
    );
    if (existingLeadIds.some((existingLeadId) => existingLeadId !== lead.id)) {
      throw new InboxActionError('ALREADY_LINKED', 'Conversation or identity is already linked to another lead');
    }

    const conversationAlreadyLinked = conversation.leadId === lead.id;
    const identityAlreadyLinked = identity.lead_id === lead.id;
    if (conversationAlreadyLinked && identityAlreadyLinked) {
      return {
        conversationId: conversation.id,
        lead,
        previousLeadId: conversation.leadId,
        previousIdentityLeadId: identity.lead_id,
        changed: false as const,
      };
    }

    if (!conversationAlreadyLinked) {
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { leadId: lead.id },
      });
    }
    if (!identityAlreadyLinked) {
      await tx.externalContactIdentity.update({
        where: { id: identity.id },
        data: { leadId: lead.id },
      });
    }

    return {
      conversationId: conversation.id,
      lead,
      previousLeadId: conversation.leadId,
      previousIdentityLeadId: identity.lead_id,
      changed: true as const,
    };
  });
}

export async function assignInboxConversation(input: {
  session: InboxSessionScope;
  conversationId: string;
  userId: string | null;
}) {
  if (!['owner', 'admin', 'manager'].includes(input.session.role)) {
    throw new InboxActionError('FORBIDDEN', 'Only managers can assign inbox conversations');
  }

  const conversationId = required(input.conversationId, 'conversationId');
  const normalizedUserId = input.userId?.trim() || null;

  return prisma.$transaction(async (tx) => {
    await lockConversation(tx, input.session.tenantId, conversationId);
    const conversation = await findScopedConversation(tx, input.session, conversationId);

    let assignee: { id: string; name: string; role: string } | null = null;
    if (normalizedUserId) {
      const membership = await tx.tenantUser.findFirst({
        where: {
          tenantId: input.session.tenantId,
          userId: normalizedUserId,
          status: 'active',
        },
        select: {
          role: true,
          user: { select: { id: true, name: true } },
        },
      });
      if (!membership || membership.role === 'viewer') {
        throw new InboxActionError('INVALID_ASSIGNEE', 'Assignee is not an active inbox operator');
      }
      assignee = {
        id: membership.user.id,
        name: membership.user.name,
        role: membership.role,
      };
    }

    await tx.conversation.update({
      where: { id: conversation.id },
      data: { assignedTo: normalizedUserId },
    });

    return {
      conversationId: conversation.id,
      previousAssignedTo: conversation.assignedTo,
      assignedTo: normalizedUserId,
      assignee,
    };
  });
}

export async function setInboxConversationStatus(input: {
  session: InboxSessionScope;
  conversationId: string;
  status: 'open' | 'resolved';
}) {
  if (!['open', 'resolved'].includes(input.status)) {
    throw new InboxActionError('INVALID_STATUS', 'Unsupported inbox status');
  }

  const conversationId = required(input.conversationId, 'conversationId');

  return prisma.$transaction(async (tx) => {
    await lockConversation(tx, input.session.tenantId, conversationId);
    const conversation = await findScopedConversation(tx, input.session, conversationId);

    if (conversation.status === input.status) {
      return {
        conversationId: conversation.id,
        previousStatus: conversation.status,
        status: input.status,
        changed: false as const,
      };
    }

    const now = new Date();
    await tx.conversation.update({
      where: { id: conversation.id },
      data: input.status === 'resolved'
        ? { status: 'resolved', resolvedAt: now, unreadCount: 0 }
        : { status: 'open', resolvedAt: null },
    });

    return {
      conversationId: conversation.id,
      previousStatus: conversation.status,
      status: input.status,
      changed: true as const,
    };
  });
}
