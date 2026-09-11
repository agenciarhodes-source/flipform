import 'server-only';

import { prisma } from '@/lib/prisma';
import { can } from '@/lib/rbac';
import { ensureLeadFromConversation } from '@/lib/leads/ensure-from-conversation';
import { LEAD_ENSURE_FROM_CONVERSATION_ACTION } from '../adapters/crm';
import type { AutomationActionHandler } from '../types';

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function findAuthorizedLeadCreator(input: { tenantId: string; preferredUserId: string | null }) {
  if (input.preferredUserId) {
    const preferred = await prisma.tenantUser.findFirst({
      where: { tenantId: input.tenantId, userId: input.preferredUserId, status: 'active' },
      select: { userId: true, role: true },
    });
    if (preferred && can(preferred.role, 'INTEGRATIONS_EDIT') && can(preferred.role, 'LEADS_CREATE')) return preferred;
  }
  const memberships = await prisma.tenantUser.findMany({
    where: { tenantId: input.tenantId, status: 'active' },
    orderBy: { createdAt: 'asc' },
    select: { userId: true, role: true },
  });
  return memberships.find((membership) => can(membership.role, 'INTEGRATIONS_EDIT')
    && can(membership.role, 'LEADS_CREATE')) || null;
}

export function createLeadEnsureFromConversationAutomationHandler(): AutomationActionHandler {
  return async (context) => {
    if (context.action.type !== LEAD_ENSURE_FROM_CONVERSATION_ACTION) {
      return { status: 'failed', code: 'INVALID_LEAD_ENSURE_ACTION' };
    }
    const conversationId = stringField(context.input.conversationId);
    const pipelineId = stringField(context.action.config.pipelineId);
    const stageId = stringField(context.action.config.stageId);
    const source = stringField(context.action.config.source);
    const rawTemperature = context.action.config.temperature;
    const temperature = rawTemperature === 'cold' || rawTemperature === 'warm' || rawTemperature === 'hot'
      ? rawTemperature : 'warm';

    if (!conversationId || !pipelineId || !stageId || (source && source.length > 120)) {
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
      const outcome = await ensureLeadFromConversation({
        tenantId: context.tenantId,
        conversationId,
        pipelineId,
        stageId,
        source,
        temperature,
        audit: {
          userId: actor.userId,
          createdAction: 'lead.automation_created',
          linkedAction: 'lead.automation_linked',
          metadata: {
            executionId: context.executionId,
            definitionId: context.definitionId,
            idempotencyKey: context.idempotencyKey,
          },
        },
      });
      if (outcome.kind === 'conversation_missing') return { status: 'failed', code: 'AUTOMATION_CONVERSATION_NOT_FOUND' };
      if (outcome.kind === 'identity_missing') return { status: 'failed', code: 'AUTOMATION_CONTACT_IDENTITY_NOT_FOUND' };
      if (outcome.kind === 'cross_tenant_link') return { status: 'failed', code: 'AUTOMATION_CROSS_TENANT_LEAD_LINK' };
      if (outcome.kind === 'pipeline_invalid') return { status: 'failed', code: 'AUTOMATION_PIPELINE_INVALID' };
      if (outcome.kind === 'stage_invalid') return { status: 'failed', code: 'AUTOMATION_STAGE_INVALID' };
      if (outcome.kind === 'ambiguous_contact') return { status: 'skipped', code: 'AUTOMATION_LEAD_CONTACT_AMBIGUOUS' };
      if (outcome.kind === 'valid_phone_required') return { status: 'failed', code: 'AUTOMATION_VALID_PHONE_REQUIRED' };
      return { status: 'completed' };
    } catch {
      return { status: 'retry', code: 'LEAD_ENSURE_INTERNAL_ERROR' };
    }
  };
}
