import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { getInboxConversationWhere, withInboxScope } from '@/lib/inbox/access';
import { messagePreview, type UnreadConversationNotification } from '@/lib/notifications/message-feed';

const MAX_ITEMS = 50;

/**
 * Conversations with unread messages, as the Inbox counts them, for the person signed in.
 * A conversation leaves this list when it is opened in the Inbox. Read only.
 */
export const GET = withPermission('INBOX_VIEW', async (_req: NextRequest, session) => {
  const where = {
    ...getInboxConversationWhere(await withInboxScope(session)),
    provider: 'meta',
    channel: { in: ['whatsapp', 'instagram'] },
    unreadCount: { gt: 0 },
  };
  const [total, conversations] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      orderBy: [{ lastInboundAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
      take: MAX_ITEMS,
      select: {
        id: true,
        unreadCount: true,
        lastInboundAt: true,
        lastMessageAt: true,
        lead: { select: { name: true } },
        externalContactIdentity: { select: { displayName: true, username: true, phone: true, externalUserId: true } },
        messages: {
          where: { direction: 'inbound' },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { type: true, text: true, createdAt: true },
        },
      },
    }),
  ]);

  const items: UnreadConversationNotification[] = conversations.map((conversation) => {
    const identity = conversation.externalContactIdentity;
    const last = conversation.messages[0];
    return {
      conversationId: conversation.id,
      contact: conversation.lead?.name || identity.displayName || identity.username || identity.phone || identity.externalUserId,
      preview: last ? messagePreview(last.type, last.text) : 'Nova mensagem',
      unreadCount: conversation.unreadCount,
      lastAt: (last?.createdAt || conversation.lastInboundAt || conversation.lastMessageAt)?.toISOString() || null,
      href: `/inbox?conversationId=${encodeURIComponent(conversation.id)}`,
    };
  });
  return NextResponse.json({ total, items });
});
