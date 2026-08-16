import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { findAccessibleInboxConversation } from '@/lib/inbox/access';

export const GET = withPermission('INBOX_VIEW', async (_req: NextRequest, session, ctx: { params: { id: string } }) => {
  const conversation = await findAccessibleInboxConversation(session, ctx.params.id);
  if (!conversation) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
  }

  const messageRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM public.messages
    WHERE tenant_id = ${session.tenantId}
      AND conversation_id = ${conversation.id}
    ORDER BY
      COALESCE(provider_timestamp, created_at) DESC,
      created_at DESC,
      id DESC
    LIMIT 200
  `);

  const selectedMessages = messageRows.length > 0
    ? await prisma.message.findMany({
        where: {
          tenantId: session.tenantId,
          conversationId: conversation.id,
          id: { in: messageRows.map((row) => row.id) },
        },
        include: {
          sentByUser: {
            select: { id: true, name: true },
          },
        },
      })
    : [];

  const messages = selectedMessages.sort((left, right) => {
    const leftTime = (left.providerTimestamp ?? left.createdAt).getTime();
    const rightTime = (right.providerTimestamp ?? right.createdAt).getTime();
    if (leftTime !== rightTime) return leftTime - rightTime;
    const createdDelta = left.createdAt.getTime() - right.createdAt.getTime();
    if (createdDelta !== 0) return createdDelta;
    return left.id.localeCompare(right.id);
  });

  return NextResponse.json({
    conversation,
    messages,
  });
});
