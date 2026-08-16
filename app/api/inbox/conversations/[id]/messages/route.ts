import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { findAccessibleInboxConversation } from '@/lib/inbox/access';

export const GET = withPermission('INBOX_VIEW', async (_req: NextRequest, session, ctx: { params: { id: string } }) => {
  const conversation = await findAccessibleInboxConversation(session, ctx.params.id);
  if (!conversation) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
  }

  const newestFirst = await prisma.message.findMany({
    where: {
      tenantId: session.tenantId,
      conversationId: conversation.id,
    },
    orderBy: [
      { providerTimestamp: 'desc' },
      { createdAt: 'desc' },
    ],
    take: 200,
    include: {
      sentByUser: {
        select: { id: true, name: true },
      },
    },
  });

  return NextResponse.json({
    conversation,
    messages: newestFirst.reverse(),
  });
});
