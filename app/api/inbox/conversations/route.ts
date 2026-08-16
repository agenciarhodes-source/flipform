import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { getInboxConversationWhere } from '@/lib/inbox/access';

const ALLOWED_STATUS = new Set(['open', 'pending', 'resolved']);
const ALLOWED_CHANNEL = new Set(['whatsapp', 'instagram']);

export const GET = withPermission('INBOX_VIEW', async (req: NextRequest, session) => {
  const url = new URL(req.url);
  const rawStatus = url.searchParams.get('status')?.trim() || '';
  const rawChannel = url.searchParams.get('channel')?.trim() || '';

  const where = {
    ...getInboxConversationWhere(session),
    ...(ALLOWED_STATUS.has(rawStatus) ? { status: rawStatus } : {}),
    ...(ALLOWED_CHANNEL.has(rawChannel) ? { channel: rawChannel } : {}),
  };

  const conversations = await prisma.conversation.findMany({
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
      messages: {
        // createdAt is always populated, including provider-rejected/outbox rows
        // whose providerTimestamp can legitimately remain null.
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          direction: true,
          type: true,
          text: true,
          status: true,
          providerTimestamp: true,
          createdAt: true,
        },
      },
    },
  });

  return NextResponse.json({ conversations });
});
