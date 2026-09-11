import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { assignLeadByRotationId } from '@/lib/lead-assignment';
import { isValidBrazilianPhone, normalizeBrazilianPhone, normalizeEmail } from '@/lib/leads';

export type LeadAttributionSnapshot = {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  fbclid?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  gclid?: string | null;
  landingPage?: string | null;
  referrer?: string | null;
  clientIp?: string | null;
  clientUserAgent?: string | null;
};

type LockedConversation = {
  id: string;
  lead_id: string | null;
  external_contact_identity_id: string;
  assigned_to: string | null;
  provider: string;
  channel: string;
};

export type EnsureConversationLeadOutcome =
  | { kind: 'created' | 'linked_existing' | 'already_linked'; leadId: string; created: boolean;
      name: string; phone: string | null; pipelineId: string; stageId: string; assignedTo: string | null }
  | { kind: 'conversation_missing' | 'identity_missing' | 'cross_tenant_link' | 'pipeline_invalid'
      | 'stage_invalid' | 'ambiguous_contact' | 'valid_phone_required' };

export async function ensureLeadFromConversation(input: {
  tenantId: string;
  conversationId: string;
  pipelineId: string;
  stageId: string;
  source?: string | null;
  temperature?: 'cold' | 'warm' | 'hot';
  rotationId?: string | null;
  requireValidPhone?: boolean;
  identity?: { displayName?: string | null; phone?: string | null; email?: string | null };
  attribution?: LeadAttributionSnapshot | null;
  audit?: { userId?: string | null; actionPrefix: string; metadata?: Prisma.InputJsonObject };
}): Promise<EnsureConversationLeadOutcome> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<LockedConversation[]>`
      SELECT id, lead_id, external_contact_identity_id, assigned_to, provider, channel
      FROM public.conversations
      WHERE id = ${input.conversationId} AND tenant_id = ${input.tenantId}
      FOR UPDATE
    `;
    const conversation = rows[0];
    if (!conversation) return { kind: 'conversation_missing' };

    if (conversation.lead_id) {
      const linked = await tx.lead.findFirst({
        where: { id: conversation.lead_id, tenantId: input.tenantId },
        select: { id: true, name: true, phone: true, pipelineId: true, stageId: true, assignedTo: true },
      });
      if (!linked) return { kind: 'cross_tenant_link' };
      await tx.externalContactIdentity.updateMany({
        where: { id: conversation.external_contact_identity_id, tenantId: input.tenantId, leadId: null },
        data: { leadId: linked.id },
      });
      return { kind: 'already_linked', leadId: linked.id, created: false, ...linked };
    }

    if (input.identity) {
      await tx.externalContactIdentity.updateMany({
        where: { id: conversation.external_contact_identity_id, tenantId: input.tenantId, leadId: null },
        data: {
          ...(input.identity.displayName ? { displayName: input.identity.displayName.trim().slice(0, 160) } : {}),
          ...(input.identity.phone ? { phone: input.identity.phone } : {}),
          ...(input.identity.email ? { email: input.identity.email } : {}),
        },
      });
    }

    const identity = await tx.externalContactIdentity.findFirst({
      where: { id: conversation.external_contact_identity_id, tenantId: input.tenantId },
      select: { id: true, leadId: true, displayName: true, username: true, phone: true, email: true },
    });
    if (!identity) return { kind: 'identity_missing' };

    if (identity.leadId) {
      const linked = await tx.lead.findFirst({
        where: { id: identity.leadId, tenantId: input.tenantId },
        select: { id: true, name: true, phone: true, pipelineId: true, stageId: true, assignedTo: true },
      });
      if (!linked) return { kind: 'cross_tenant_link' };
      await tx.conversation.updateMany({
        where: { id: conversation.id, tenantId: input.tenantId, leadId: null },
        data: { leadId: linked.id },
      });
      return { kind: 'already_linked', leadId: linked.id, created: false, ...linked };
    }

    const [pipeline, stage] = await Promise.all([
      tx.pipeline.findFirst({ where: { id: input.pipelineId, tenantId: input.tenantId, isArchived: false }, select: { id: true } }),
      tx.pipelineStage.findFirst({
        where: { id: input.stageId, pipelineId: input.pipelineId, isArchived: false,
          pipeline: { tenantId: input.tenantId, isArchived: false } },
        select: { id: true },
      }),
    ]);
    if (!pipeline) return { kind: 'pipeline_invalid' };
    if (!stage) return { kind: 'stage_invalid' };

    await tx.$queryRaw`SELECT id FROM public.tenants WHERE id = ${input.tenantId} FOR UPDATE`;
    const phone = normalizeBrazilianPhone(identity.phone);
    if (input.requireValidPhone && (!phone || !isValidBrazilianPhone(phone))) {
      return { kind: 'valid_phone_required' };
    }
    const email = normalizeEmail(identity.email);
    const contactOr: Prisma.LeadWhereInput[] = [];
    if (phone) contactOr.push({ phone });
    if (email) contactOr.push({ email });
    const matches = contactOr.length
      ? await tx.lead.findMany({
          where: { tenantId: input.tenantId, OR: contactOr },
          orderBy: { createdAt: 'asc' },
          take: 2,
          select: { id: true, name: true, phone: true, pipelineId: true, stageId: true, assignedTo: true },
        })
      : [];
    if (matches.length > 1) return { kind: 'ambiguous_contact' };

    let lead;
    let created = false;
    if (matches[0]) {
      lead = matches[0];
    } else {
      let assignedTo: string | null = null;
      if (input.rotationId) {
        assignedTo = (await assignLeadByRotationId({
          tenantId: input.tenantId, rotationId: input.rotationId, tx,
        })).assignedTo;
      } else if (conversation.assigned_to) {
        const membership = await tx.tenantUser.findFirst({
          where: { tenantId: input.tenantId, userId: conversation.assigned_to, status: 'active' },
          select: { userId: true },
        });
        assignedTo = membership?.userId || null;
      }
      const name = (identity.displayName || identity.username || phone || email || 'Contato').trim().slice(0, 160);
      lead = await tx.lead.create({
        data: {
          tenantId: input.tenantId,
          formId: null,
          pipelineId: input.pipelineId,
          stageId: input.stageId,
          assignedTo,
          name,
          email,
          phone,
          source: input.source?.trim().slice(0, 120)
            || (conversation.channel === 'whatsapp' ? 'whatsapp'
              : conversation.channel === 'instagram' ? 'instagram_direct' : 'customer_service'),
          status: 'open',
          temperature: input.temperature || 'warm',
          enteredAt: new Date(),
        },
        select: { id: true, name: true, phone: true, pipelineId: true, stageId: true, assignedTo: true },
      });
      created = true;
      await tx.leadStageHistory.create({
        data: { leadId: lead.id, fromStageId: null, toStageId: input.stageId, changedBy: input.audit?.userId || null },
      });
      if (input.attribution) {
        await tx.leadAttribution.create({
          data: { tenantId: input.tenantId, leadId: lead.id, ...input.attribution },
        });
      }
    }

    await tx.conversation.updateMany({
      where: { id: conversation.id, tenantId: input.tenantId },
      data: { leadId: lead.id, assignedTo: lead.assignedTo },
    });
    await tx.externalContactIdentity.updateMany({
      where: { id: identity.id, tenantId: input.tenantId },
      data: { leadId: lead.id },
    });
    if (input.audit) {
      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.audit.userId || null,
          entityType: 'lead',
          entityId: lead.id,
          action: `${input.audit.actionPrefix}.${created ? 'created' : 'linked'}`,
          metadata: { conversationId: conversation.id, ...(input.audit.metadata || {}) },
        },
      });
    }
    return { kind: created ? 'created' : 'linked_existing', leadId: lead.id, created, ...lead };
  });
}
