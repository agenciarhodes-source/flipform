import 'server-only';

import { prisma } from '@/lib/prisma';
import { can } from '@/lib/rbac';
import {
  enqueueAndDispatchWhatsAppTextMessage,
  WhatsAppOutboundError,
} from '@/lib/meta/whatsapp-outbound';
import { WHATSAPP_SEND_TEXT_ACTION } from '../adapters/whatsapp-message';
import type { AutomationActionHandler } from '../types';

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function findAuthorizedAutomationActor(input: {
  tenantId: string;
  preferredUserId: string | null;
}) {
  if (input.preferredUserId) {
    const preferred = await prisma.tenantUser.findFirst({
      where: {
        tenantId: input.tenantId,
        userId: input.preferredUserId,
        status: 'active',
      },
      select: { userId: true, role: true },
    });
    if (
      preferred
      && can(preferred.role, 'INTEGRATIONS_EDIT')
      && can(preferred.role, 'LEADS_CONTACT_WHATSAPP')
    ) return preferred;
  }

  const memberships = await prisma.tenantUser.findMany({
    where: { tenantId: input.tenantId, status: 'active' },
    orderBy: { createdAt: 'asc' },
    select: { userId: true, role: true },
  });
  return memberships.find(membership => (
    can(membership.role, 'INTEGRATIONS_EDIT')
    && can(membership.role, 'LEADS_CONTACT_WHATSAPP')
  )) || null;
}

export function createWhatsAppSendTextAutomationHandler(): AutomationActionHandler {
  return async context => {
    if (context.action.type !== WHATSAPP_SEND_TEXT_ACTION) {
      return { status: 'failed', code: 'INVALID_WHATSAPP_SEND_TEXT_ACTION' };
    }

    const conversationId = stringField(context.input.conversationId);
    const text = stringField(context.action.config.text);
    if (!conversationId || !text || text.length > 4096) {
      return { status: 'failed', code: 'INVALID_WHATSAPP_SEND_TEXT_CONFIG' };
    }

    const actor = await findAuthorizedAutomationActor({
      tenantId: context.tenantId,
      preferredUserId: context.configuredByUserId,
    });
    if (!actor) {
      return { status: 'skipped', code: 'NO_AUTHORIZED_WHATSAPP_AUTOMATION_ACTOR' };
    }

    try {
      const result = await enqueueAndDispatchWhatsAppTextMessage({
        tenantId: context.tenantId,
        conversationId,
        requestedByUserId: actor.userId,
        text,
        idempotencyKey: context.idempotencyKey,
      });

      if (result.status === 'sent') return { status: 'completed' };
      if (result.status === 'in_progress') {
        return { status: 'retry', code: 'WHATSAPP_SEND_IN_PROGRESS' };
      }
      if (result.status === 'delivery_unknown') {
        return { status: 'delivery_unknown', code: 'WHATSAPP_SEND_DELIVERY_UNKNOWN' };
      }
      return { status: 'failed', code: 'WHATSAPP_SEND_FAILED' };
    } catch (error) {
      if (error instanceof WhatsAppOutboundError) {
        if (error.code === 'FORBIDDEN') {
          return { status: 'skipped', code: 'WHATSAPP_AUTOMATION_ACTOR_FORBIDDEN' };
        }
        return { status: 'failed', code: `WHATSAPP_SEND_${error.code}` };
      }
      return { status: 'retry', code: 'WHATSAPP_SEND_INTERNAL_ERROR' };
    }
  };
}
