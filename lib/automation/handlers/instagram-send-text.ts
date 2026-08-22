import 'server-only';

import { prisma } from '@/lib/prisma';
import { can } from '@/lib/rbac';
import {
  enqueueAndDispatchInstagramTextMessage,
  InstagramOutboundError,
} from '@/lib/meta/instagram-outbound';
import { INSTAGRAM_SEND_TEXT_ACTION } from '../adapters/instagram-message';
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
      && can(preferred.role, 'INBOX_MANAGE')
    ) return preferred;
  }

  const memberships = await prisma.tenantUser.findMany({
    where: { tenantId: input.tenantId, status: 'active' },
    orderBy: { createdAt: 'asc' },
    select: { userId: true, role: true },
  });
  return memberships.find(membership => (
    can(membership.role, 'INTEGRATIONS_EDIT')
    && can(membership.role, 'INBOX_MANAGE')
  )) || null;
}

export function createInstagramSendTextAutomationHandler(): AutomationActionHandler {
  return async context => {
    if (context.action.type !== INSTAGRAM_SEND_TEXT_ACTION) {
      return { status: 'failed', code: 'INVALID_INSTAGRAM_SEND_TEXT_ACTION' };
    }

    const conversationId = stringField(context.input.conversationId);
    const text = stringField(context.action.config.text);
    if (!conversationId || !text || text.length > 4096) {
      return { status: 'failed', code: 'INVALID_INSTAGRAM_SEND_TEXT_CONFIG' };
    }

    const actor = await findAuthorizedAutomationActor({
      tenantId: context.tenantId,
      preferredUserId: context.configuredByUserId,
    });
    if (!actor) {
      return { status: 'skipped', code: 'NO_AUTHORIZED_INSTAGRAM_AUTOMATION_ACTOR' };
    }

    try {
      const result = await enqueueAndDispatchInstagramTextMessage({
        tenantId: context.tenantId,
        conversationId,
        requestedByUserId: actor.userId,
        text,
        idempotencyKey: context.idempotencyKey,
      });

      if (result.status === 'sent') return { status: 'completed' };
      if (result.status === 'in_progress') {
        return { status: 'retry', code: 'INSTAGRAM_SEND_IN_PROGRESS' };
      }
      if (result.status === 'delivery_unknown') {
        return { status: 'delivery_unknown', code: 'INSTAGRAM_SEND_DELIVERY_UNKNOWN' };
      }
      return { status: 'failed', code: 'INSTAGRAM_SEND_FAILED' };
    } catch (error) {
      if (error instanceof InstagramOutboundError) {
        if (error.code === 'FORBIDDEN') {
          return { status: 'skipped', code: 'INSTAGRAM_AUTOMATION_ACTOR_FORBIDDEN' };
        }
        if (error.code === 'NOT_CONNECTED') {
          return { status: 'skipped', code: 'INSTAGRAM_AUTOMATION_NOT_CONNECTED' };
        }
        if (error.code === 'ACCOUNT_MISMATCH') {
          return { status: 'skipped', code: 'INSTAGRAM_AUTOMATION_ACCOUNT_MISMATCH' };
        }
        if (error.code === 'RECIPIENT_NOT_ELIGIBLE') {
          return { status: 'skipped', code: 'INSTAGRAM_AUTOMATION_RECIPIENT_NOT_ELIGIBLE' };
        }
        return { status: 'failed', code: `INSTAGRAM_SEND_${error.code}` };
      }
      return { status: 'retry', code: 'INSTAGRAM_SEND_INTERNAL_ERROR' };
    }
  };
}
