import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { getInboxConversationWhere } from '@/lib/inbox/access';
import { messagePreview, type MessageNotification } from '@/lib/notifications/message-feed';

const MAX_ITEMS = 30;

/**
 * New messages customers sent, for the person signed in: a manager is told about every
 * conversation, an attendant only about hers, exactly as the Inbox shows them. Read only.
 */
export const GET = withPermission('INBOX_VIEW', async (req: NextRequest, session) => {
  const afterRaw = req.nextUrl.searchParams.get('after');
  const afterId = req.nextUrl.searchParams.get('afterId')?.trim() || null;

  // The first call only sets the starting point, so old messages are never announced.
  if (!afterRaw) {
    return NextResponse.json({ items: [], cursor: { createdAt: new Date().toISOString(), id: null } });
  }
  const after = new Date(afterRaw);
  if (Number.isNaN(after.getTime())) return NextResponse.json({ error: 'Cursor inválido.' }, { status: 400 });

  const messages = await prisma.message.findMany({
    where: {
      tenantId: session.tenantId,
      provider: 'meta',
      channel: { in: ['whatsapp', 'instagram'] },
      direction: 'inbound',
      conversation: getInboxConversationWhere(session),
      ...(afterId
        ? { OR: [{ createdAt: { gt: after } }, { createdAt: after, id: { gt: afterId } }] }
        : { createdAt: { gt: after } }),
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: MAX_ITEMS,
    select: {
      id: true,
      type: true,
      text: true,
      channel: true,
      createdAt: true,
      conversationId: true,
      conversation: {
        select: {
          lead: { select: { name: true } },
          externalContactIdentity: { select: { displayName: true, username: true, phone: true, externalUserId: true } },
        },
      },
    },
  });

  const items: MessageNotification[] = messages.map((message) => {
    const identity = message.conversation.externalContactIdentity;
    return {
      id: `message:${message.id}`,
      conversationId: message.conversationId,
      contact: message.conversation.lead?.name || identity.displayName || identity.username || identity.phone || identity.externalUserId,
      preview: messagePreview(message.type, message.text),
      channel: message.channel,
      createdAt: message.createdAt.toISOString(),
      href: `/inbox?conversationId=${encodeURIComponent(message.conversationId)}`,
    };
  });
  const last = messages.at(-1);
  return NextResponse.json({
    items,
    cursor: last ? { createdAt: last.createdAt.toISOString(), id: last.id } : { createdAt: after.toISOString(), id: afterId },
  });
});
