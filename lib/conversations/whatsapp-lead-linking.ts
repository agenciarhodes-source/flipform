import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getBrazilianPhoneAliases } from '@/lib/leads';

type LeadPhoneRow = {
  id: string;
  assigned_to: string | null;
};

type ConversationPhoneRow = {
  id: string;
};

function phoneCandidates(phone?: string | null) {
  return getBrazilianPhoneAliases(phone);
}

async function findUniqueLeadByPhone(tenantId: string, phone?: string | null) {
  const candidates = phoneCandidates(phone);
  if (candidates.length === 0) {
    return { lead: null, reason: 'missing_phone' as const };
  }

  const rows = await prisma.$queryRaw<LeadPhoneRow[]>(Prisma.sql`
    SELECT id, assigned_to
    FROM public.leads
    WHERE tenant_id = ${tenantId}
      AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') IN (${Prisma.join(candidates)})
    ORDER BY updated_at DESC, id DESC
    LIMIT 2
  `);

  if (rows.length === 0) return { lead: null, reason: 'lead_not_found' as const };
  if (rows.length > 1) return { lead: null, reason: 'ambiguous_lead' as const };
  return { lead: rows[0], reason: 'unique_match' as const };
}

async function safelyLinkConversation(input: {
  tenantId: string;
  conversationId: string;
  leadId: string;
  leadAssignedTo: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findFirst({
      where: {
        id: input.conversationId,
        tenantId: input.tenantId,
        provider: 'meta',
        channel: 'whatsapp',
      },
      select: {
        id: true,
        leadId: true,
        assignedTo: true,
        externalContactIdentityId: true,
      },
    });
    if (!conversation) return { linked: false, reason: 'conversation_not_found' as const };
    if (conversation.leadId && conversation.leadId !== input.leadId) {
      return { linked: false, reason: 'conversation_already_linked' as const };
    }

    const identity = await tx.externalContactIdentity.findFirst({
      where: {
        id: conversation.externalContactIdentityId,
        tenantId: input.tenantId,
        provider: 'meta',
        channel: 'whatsapp',
      },
      select: { id: true, leadId: true },
    });
    if (!identity) return { linked: false, reason: 'identity_not_found' as const };
    if (identity.leadId && identity.leadId !== input.leadId) {
      return { linked: false, reason: 'identity_already_linked' as const };
    }

    const lead = await tx.lead.findFirst({
      where: { id: input.leadId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!lead) return { linked: false, reason: 'lead_not_found' as const };

    await tx.conversation.updateMany({
      where: {
        id: conversation.id,
        tenantId: input.tenantId,
        OR: [{ leadId: null }, { leadId: input.leadId }],
      },
      data: { leadId: input.leadId },
    });

    await tx.externalContactIdentity.updateMany({
      where: {
        id: identity.id,
        tenantId: input.tenantId,
        OR: [{ leadId: null }, { leadId: input.leadId }],
      },
      data: { leadId: input.leadId },
    });

    if (!conversation.assignedTo && input.leadAssignedTo) {
      await tx.conversation.updateMany({
        where: {
          id: conversation.id,
          tenantId: input.tenantId,
          assignedTo: null,
        },
        data: { assignedTo: input.leadAssignedTo },
      });
    }

    return { linked: true, reason: 'linked' as const, conversationId: conversation.id };
  });
}

export async function linkWhatsAppConversationToMatchingLead(input: {
  tenantId: string;
  conversationId: string;
  phone?: string | null;
}) {
  const current = await prisma.conversation.findFirst({
    where: {
      id: input.conversationId,
      tenantId: input.tenantId,
      provider: 'meta',
      channel: 'whatsapp',
    },
    select: {
      id: true,
      leadId: true,
      externalContactIdentity: { select: { leadId: true, phone: true, externalUserId: true } },
    },
  });

  if (!current) return { linked: false, reason: 'conversation_not_found' as const };
  if (current.leadId) return { linked: true, reason: 'already_linked' as const, conversationId: current.id, leadId: current.leadId };
  if (current.externalContactIdentity.leadId) {
    const lead = await prisma.lead.findFirst({
      where: { id: current.externalContactIdentity.leadId, tenantId: input.tenantId },
      select: { id: true, assignedTo: true },
    });
    if (!lead) return { linked: false, reason: 'lead_not_found' as const };
    const linked = await safelyLinkConversation({
      tenantId: input.tenantId,
      conversationId: current.id,
      leadId: lead.id,
      leadAssignedTo: lead.assignedTo,
    });
    return { ...linked, leadId: linked.linked ? lead.id : undefined };
  }

  const match = await findUniqueLeadByPhone(
    input.tenantId,
    input.phone || current.externalContactIdentity.phone || current.externalContactIdentity.externalUserId,
  );
  if (!match.lead) return { linked: false, reason: match.reason };

  const linked = await safelyLinkConversation({
    tenantId: input.tenantId,
    conversationId: current.id,
    leadId: match.lead.id,
    leadAssignedTo: match.lead.assigned_to,
  });
  return { ...linked, leadId: linked.linked ? match.lead.id : undefined };
}

export async function findOrLinkWhatsAppConversationForLead(input: {
  tenantId: string;
  leadId: string;
}) {
  const lead = await prisma.lead.findFirst({
    where: { id: input.leadId, tenantId: input.tenantId },
    select: { id: true, phone: true, assignedTo: true },
  });
  if (!lead) return { conversationId: null, reason: 'lead_not_found' as const };

  const linkedConversation = await prisma.conversation.findFirst({
    where: {
      tenantId: input.tenantId,
      provider: 'meta',
      channel: 'whatsapp',
      OR: [
        { leadId: lead.id },
        { externalContactIdentity: { is: { leadId: lead.id } } },
      ],
    },
    orderBy: [
      { lastMessageAt: { sort: 'desc', nulls: 'last' } },
      { updatedAt: 'desc' },
    ],
    select: { id: true, leadId: true },
  });

  if (linkedConversation) {
    if (!linkedConversation.leadId) {
      const linked = await safelyLinkConversation({
        tenantId: input.tenantId,
        conversationId: linkedConversation.id,
        leadId: lead.id,
        leadAssignedTo: lead.assignedTo,
      });
      if (!linked.linked) return { conversationId: null, reason: linked.reason };
    }
    return { conversationId: linkedConversation.id, reason: 'already_linked' as const };
  }

  const candidates = phoneCandidates(lead.phone);
  if (candidates.length === 0) return { conversationId: null, reason: 'missing_phone' as const };

  const rows = await prisma.$queryRaw<ConversationPhoneRow[]>(Prisma.sql`
    SELECT c.id
    FROM public.conversations c
    INNER JOIN public.external_contact_identities e
      ON e.id = c.external_contact_identity_id
     AND e.tenant_id = c.tenant_id
    WHERE c.tenant_id = ${input.tenantId}
      AND c.provider = 'meta'
      AND c.channel = 'whatsapp'
      AND e.provider = 'meta'
      AND e.channel = 'whatsapp'
      AND regexp_replace(COALESCE(NULLIF(e.phone, ''), e.external_user_id), '[^0-9]', '', 'g') IN (${Prisma.join(candidates)})
      AND (c.lead_id IS NULL OR c.lead_id = ${lead.id})
      AND (e.lead_id IS NULL OR e.lead_id = ${lead.id})
    ORDER BY c.last_message_at DESC NULLS LAST, c.updated_at DESC, c.id DESC
    LIMIT 2
  `);

  if (rows.length === 0) return { conversationId: null, reason: 'conversation_not_found' as const };
  if (rows.length > 1) return { conversationId: null, reason: 'ambiguous_conversation' as const };

  const linked = await safelyLinkConversation({
    tenantId: input.tenantId,
    conversationId: rows[0].id,
    leadId: lead.id,
    leadAssignedTo: lead.assignedTo,
  });
  if (!linked.linked) return { conversationId: null, reason: linked.reason };

  return { conversationId: rows[0].id, reason: 'linked' as const };
}
