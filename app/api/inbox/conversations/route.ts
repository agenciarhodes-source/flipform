import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { getInboxConversationWhere } from '@/lib/inbox/access';

const ALLOWED_STATUS = new Set(['open', 'pending', 'resolved']);
const ALLOWED_CHANNEL = new Set(['whatsapp', 'instagram']);

type LatestMessageRow = {
  id: string;
  conversation_id: string;
};

export const GET = withPermission('INBOX_VIEW', async (req: NextRequest, session) => {
  const url = new URL(req.url);
  const rawStatus = url.searchParams.get('status')?.trim() || '';
  const rawChannel = url.searchParams.get('channel')?.trim() || '';

  const where = {
    ...getInboxConversationWhere(session),
    ...(ALLOWED_STATUS.has(rawStatus) ? { status: rawStatus } : {}),
    ...(ALLOWED_CHANNEL.has(rawChannel) ? { channel: rawChannel } : {}),
  };

  const baseConversations = await prisma.conversation.findMany({
    where,
    orderBy: [
      { lastMessageAt: { sort: 'desc', nulls: 'last' } },
      { updatedAt: 'desc' },
    ],
    take: 100,
    include: {
      externalContactIdentity: {
        select: {
          id: true,
          externalUserId: true,
          username: true,
          displayName: true,
          phone: true,
          email: true,
        },
      },
      lead: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          assignedTo: true,
        },
      },
      assignee: {
        select: { id: true, name: true },
      },
    },
  });

  if (baseConversations.length === 0) {
    return NextResponse.json({ conversations: [] });
  }

  const conversationIds = baseConversations.map((conversation) => conversation.id);
  const latestRows = await prisma.$queryRaw<LatestMessageRow[]>(Prisma.sql`
    SELECT DISTINCT ON (conversation_id)
      id,
      conversation_id
    FROM public.messages
    WHERE tenant_id = ${session.tenantId}
      AND conversation_id IN (${Prisma.join(conversationIds)})
    ORDER BY
      conversation_id,
      COALESCE(provider_timestamp, created_at) DESC,
      created_at DESC,
      id DESC
  `);

  const latestMessages = latestRows.length > 0
    ? await prisma.message.findMany({
        where: {
          tenantId: session.tenantId,
          id: { in: latestRows.map((row) => row.id) },
        },
        select: {
          id: true,
          conversationId: true,
          direction: true,
          type: true,
          text: true,
          status: true,
          providerTimestamp: true,
          createdAt: true,
        },
      })
    : [];

  const messageById = new Map(latestMessages.map((message) => [message.id, message]));
  const latestMessageIdByConversation = new Map(latestRows.map((row) => [row.conversation_id, row.id]));

  const conversations = baseConversations.map((conversation) => {
    const messageId = latestMessageIdByConversation.get(conversation.id);
    const message = messageId ? messageById.get(messageId) : undefined;
    return {
      ...conversation,
      messages: message ? [message] : [],
    };
  });

  return NextResponse.json({ conversations });
});
