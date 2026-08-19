import 'server-only';

import { prisma } from '@/lib/prisma';
import { can } from '@/lib/rbac';
import {
  enqueueAndDispatchInstagramPrivateReply,
  InstagramPrivateReplyError,
} from '@/lib/meta/instagram-private-reply';
import { INSTAGRAM_PRIVATE_REPLY_ACTION } from '../adapters/instagram-comment';
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
    if (preferred && can(preferred.role, 'INTEGRATIONS_EDIT')) return preferred;
  }

  const memberships = await prisma.tenantUser.findMany({
    where: { tenantId: input.tenantId, status: 'active' },
    orderBy: { createdAt: 'asc' },
    select: { userId: true, role: true },
  });
  return memberships.find(membership => can(membership.role, 'INTEGRATIONS_EDIT')) || null;
}

export function createInstagramPrivateReplyAutomationHandler(): AutomationActionHandler {
  return async context => {
    if (context.action.type !== INSTAGRAM_PRIVATE_REPLY_ACTION) {
      return { status: 'failed', code: 'INVALID_INSTAGRAM_PRIVATE_REPLY_ACTION' };
    }

    const sourceCommentEventId = stringField(context.input.sourceCommentEventId);
    const replyText = stringField(context.action.config.replyText);
    if (!sourceCommentEventId || !replyText || replyText.length > 4096) {
      return { status: 'failed', code: 'INVALID_INSTAGRAM_PRIVATE_REPLY_CONFIG' };
    }

    const actor = await findAuthorizedAutomationActor({
      tenantId: context.tenantId,
      preferredUserId: context.configuredByUserId,
    });
    if (!actor) {
      return { status: 'skipped', code: 'NO_AUTHORIZED_AUTOMATION_ACTOR' };
    }

    try {
      const result = await enqueueAndDispatchInstagramPrivateReply({
        tenantId: context.tenantId,
        sourceCommentEventId,
        requestedByUserId: actor.userId,
        text: replyText,
        idempotencyKey: context.idempotencyKey,
      });

      if (result.status === 'sent') return { status: 'completed' };
      if (result.status === 'in_progress') {
        return { status: 'retry', code: 'PRIVATE_REPLY_IN_PROGRESS' };
      }
      if (result.status === 'delivery_unknown') {
        return { status: 'delivery_unknown', code: 'PRIVATE_REPLY_DELIVERY_UNKNOWN' };
      }
      return { status: 'failed', code: 'PRIVATE_REPLY_FAILED' };
    } catch (error) {
      if (error instanceof InstagramPrivateReplyError) {
        if (error.code === 'ALREADY_REPLIED') {
          return { status: 'skipped', code: 'PRIVATE_REPLY_ALREADY_ATTEMPTED' };
        }
        return { status: 'failed', code: `PRIVATE_REPLY_${error.code}` };
      }
      return { status: 'retry', code: 'PRIVATE_REPLY_INTERNAL_ERROR' };
    }
  };
}
