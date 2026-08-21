import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { can } from '@/lib/rbac';
import { normalizeBrazilianPhone, normalizeEmail } from '@/lib/leads';
import { LEAD_ENSURE_FROM_CONVERSATION_ACTION } from '../adapters/crm';
import type { AutomationActionHandler } from '../types';

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function findAuthorizedLeadCreator(input: {
  tenantId: string;
  preferredUserId: string | null;
}) {
  if (input.preferredUserId) {
    const preferred = await prisma.tenantUser.findFirst({
      where: { tenantId: input.tenantId, userId: input.preferredUserId, status: 'active' },
      select: { userId: true, role: true },
    });
    if (preferred && can(preferred.role, 'INTEGRATIONS_EDIT') && can(preferred.role, 'LEADS_CREATE')) {
      return preferred;
    }
  }

  const memberships = await prisma.tenantUser.findMany({
    where: { tenantId: input.tenantId, status: 'active' },
    orderBy: { createdAt: 'asc' },
    select: { userId: true, role: true },
  });
  return memberships.find(membership => (
    can(membership.role, 'INTEGRATIONS_EDIT')
    && can(membership.role, 'LEADS_CREATE')
  )) || null;
}

type LockedConversation = {
  id: string;
  lead_id: string | null;
  external_contact_identity_id: string;
  assigned_to: string | null;
  channel: string;
};

export function createLeadEnsureFromConversationAutomationHandler(): AutomationActionHandler {
  return async context => {
    if (context.action.type !== LEAD_ENSURE_FROM_CONVERSATION_ACTION) {
      return { status: 'failed', code: 'INVALID_LEAD_ENSURE_ACTION' };
    }

    const conversationId = stringField(context.input.conversationId);
    const pipelineId = stringField(context.action.config.pipelineId);
    const stageId = stringField(context.action.config.stageId);
    const configuredSource = stringField(context.action.config.source);
    const rawTemperature = context.action.config.temperature;
    const temperature = rawTemperature === 'cold' || rawTemperature === 'warm' || rawTemperature === 'hot'
      ? rawTemperature
      : 'warm';

    if (!conversationId || !pipelineId || !stageId || (configuredSource && configuredSource.length > 120)) {
      return { status: 'failed', code: 'INVALID_LEAD_ENSURE_CONFIG' };
    }
    if (rawTemperature !== undefined && !['cold', 'warm', 'hot'].includes(String(rawTemperature))) {
      return { status: 'failed', code: 'INVALID_LEAD_TEMPERATURE' };
    }

    const actor = await findAuthorizedLeadCreator({
      tenantId: context.tenantId,
      preferredUserId: context.configuredByUserId,
    });
    if (!actor) return { status: 'skipped', code: 'NO_AUTHORIZED_LEAD_AUTOMATION_ACTOR' };

    try {
      const outcome = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const rows = await tx.$queryRaw<LockedConversation[]>`
          SELECT id, lead_id, external_contact_identity_id, assigned_to, channel
          FROM public.conversations
          WHERE id = ${conversationId}
            AND tenant_id = ${context.tenantId}
          FOR UPDATE
        `;
        const conversation = rows[0];
        if (!conversation) return { kind: 'conversation_missing' as const };

        if (conversation.lead_id) {
          const linkedLead = await tx.lead.findFirst({
            where: { id: conversation.lead_id, tenantId: context.tenantId },
            select: { id: true },
          });
          if (!linkedLead) return { kind: 'cross_tenant_link' as const };
          await tx.externalContactIdentity.updateMany({
            where: { id: conversation.external_contact_identity_id, tenantId: context.tenantId, leadId: null },
            data: { leadId: linkedLead.id },
          });
          return { kind: 'already_linked' as const, leadId: linkedLead.id };
        }

        const identity = await tx.externalContactIdentity.findFirst({
          where: { id: conversation.external_contact_identity_id, tenantId: context.tenantId },
          select: {
            id: true,
            leadId: true,
            displayName: true,
            username: true,
            phone: true,
            email: true,
          },
        });
        if (!identity) return { kind: 'identity_missing' as const };

        if (identity.leadId) {
          const linkedLead = await tx.lead.findFirst({
            where: { id: identity.leadId, tenantId: context.tenantId },
            select: { id: true },
          });
          if (!linkedLead) return { kind: 'cross_tenant_link' as const };
          await tx.conversation.update({ where: { id: conversation.id }, data: { leadId: linkedLead.id } });
          return { kind: 'already_linked' as const, leadId: linkedLead.id };
        }

        const [pipeline, stage] = await Promise.all([
          tx.pipeline.findFirst({
            where: { id: pipelineId, tenantId: context.tenantId, isArchived: false },
            select: { id: true },
          }),
          tx.pipelineStage.findFirst({
            where: {
              id: stageId,
              pipelineId,
              isArchived: false,
              pipeline: { tenantId: context.tenantId, isArchived: false },
            },
            select: { id: true },
          }),
        ]);
        if (!pipeline) return { kind: 'pipeline_invalid' as const };
        if (!stage) return { kind: 'stage_invalid' as const };

        // Serialize automated lead creation per tenant so two conversations with the
        // same contact cannot race through duplicate detection and create twins.
        await tx.$queryRaw`SELECT id FROM public.tenants WHERE id = ${context.tenantId} FOR UPDATE`;

        const phone = normalizeBrazilianPhone(identity.phone);
        const email = normalizeEmail(identity.email);
        const contactOr: Prisma.LeadWhereInput[] = [];
        if (phone) contactOr.push({ phone });
        if (email) contactOr.push({ email });

        const matches = contactOr.length
          ? await tx.lead.findMany({
              where: { tenantId: context.tenantId, OR: contactOr },
              orderBy: { createdAt: 'asc' },
              take: 2,
              select: { id: true },
            })
          : [];

        if (matches.length > 1) return { kind: 'ambiguous_contact' as const };

        let leadId: string;
        let created = false;
        if (matches[0]) {
          leadId = matches[0].id;
        } else {
          let assignedTo: string | null = null;
          if (conversation.assigned_to) {
            const assignedMembership = await tx.tenantUser.findFirst({
              where: { tenantId: context.tenantId, userId: conversation.assigned_to, status: 'active' },
              select: { userId: true },
            });
            assignedTo = assignedMembership?.userId || null;
          }

          const source = configuredSource
            || (conversation.channel === 'whatsapp' ? 'whatsapp' : conversation.channel === 'instagram' ? 'instagram_direct' : 'customer_service');
          const name = (
            identity.displayName
            || identity.username
            || phone
            || email
            || (conversation.channel === 'whatsapp' ? 'Contato WhatsApp' : 'Contato Instagram')
          ).trim().slice(0, 160);

          const lead = await tx.lead.create({
            data: {
              tenantId: context.tenantId,
              formId: null,
              pipelineId,
              stageId,
              assignedTo,
              name,
              email,
              phone,
              source,
              status: 'open',
              temperature,
              enteredAt: new Date(),
            },
            select: { id: true },
          });
          leadId = lead.id;
          created = true;

          await tx.leadStageHistory.create({
            data: {
              leadId,
              fromStageId: null,
              toStageId: stageId,
              changedBy: actor.userId,
            },
          });
        }

        await tx.conversation.update({ where: { id: conversation.id }, data: { leadId } });
        await tx.externalContactIdentity.update({ where: { id: identity.id }, data: { leadId } });

        await tx.auditLog.create({
          data: {
            tenantId: context.tenantId,
            userId: actor.userId,
            entityType: 'lead',
            entityId: leadId,
            action: created ? 'lead.automation_created' : 'lead.automation_linked',
            metadata: {
              executionId: context.executionId,
              definitionId: context.definitionId,
              conversationId,
              idempotencyKey: context.idempotencyKey,
            },
          },
        });

        return { kind: created ? 'created' as const : 'linked_existing' as const, leadId };
      });

      if (outcome.kind === 'conversation_missing') return { status: 'failed', code: 'AUTOMATION_CONVERSATION_NOT_FOUND' };
      if (outcome.kind === 'identity_missing') return { status: 'failed', code: 'AUTOMATION_CONTACT_IDENTITY_NOT_FOUND' };
      if (outcome.kind === 'cross_tenant_link') return { status: 'failed', code: 'AUTOMATION_CROSS_TENANT_LEAD_LINK' };
      if (outcome.kind === 'pipeline_invalid') return { status: 'failed', code: 'AUTOMATION_PIPELINE_INVALID' };
      if (outcome.kind === 'stage_invalid') return { status: 'failed', code: 'AUTOMATION_STAGE_INVALID' };
      if (outcome.kind === 'ambiguous_contact') return { status: 'skipped', code: 'AUTOMATION_LEAD_CONTACT_AMBIGUOUS' };
      return { status: 'completed' };
    } catch {
      return { status: 'retry', code: 'LEAD_ENSURE_INTERNAL_ERROR' };
    }
  };
}
