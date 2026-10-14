import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { getInboxConversationWhere } from '@/lib/inbox/access';
import { isWaitingForAnswer, UNANSWERED_AFTER_MINUTES, UNANSWERED_LOOKBACK_HOURS } from '@/lib/inbox/unanswered';

/**
 * Conversations where the person is waiting for an answer, within what this user may see:
 * a manager sees every one, an attendant only hers. Read only: nothing is written.
 */
export const GET = withPermission('INBOX_VIEW', async (_req: NextRequest, session) => {
  const now = new Date();
  const candidates = await prisma.conversation.findMany({
    where: {
      ...getInboxConversationWhere(session),
      provider: 'meta',
      channel: { in: ['whatsapp', 'instagram'] },
      status: { not: 'resolved' },
      lastInboundAt: {
        lte: new Date(now.getTime() - UNANSWERED_AFTER_MINUTES * 60_000),
        gte: new Date(now.getTime() - UNANSWERED_LOOKBACK_HOURS * 3_600_000),
      },
    },
    orderBy: { lastInboundAt: 'asc' },
    take: 100,
    select: {
      id: true,
      status: true,
      lastInboundAt: true,
      lastOutboundAt: true,
      lead: { select: { name: true } },
      assignee: { select: { name: true } },
      externalContactIdentity: { select: { displayName: true, phone: true, externalUserId: true } },
    },
  });
  const waiting = candidates.filter((conversation) => isWaitingForAnswer({ ...conversation, now }));
  return NextResponse.json({
    afterMinutes: UNANSWERED_AFTER_MINUTES,
    conversations: waiting.slice(0, 20).map((conversation) => ({
      id: conversation.id,
      contact: conversation.lead?.name
        || conversation.externalContactIdentity.displayName
        || conversation.externalContactIdentity.phone
        || conversation.externalContactIdentity.externalUserId,
      assignee: conversation.assignee?.name || null,
      waitingSince: conversation.lastInboundAt?.toISOString() || null,
    })),
    total: waiting.length,
  });
});
