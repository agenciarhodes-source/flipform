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

  const senderUserIds = [...new Set(
    selectedMessages
      .map((message) => message.sentByUserId)
      .filter((userId): userId is string => Boolean(userId)),
  )];
  const senderMemberships = senderUserIds.length > 0
    ? await prisma.tenantUser.findMany({
        where: {
          tenantId: session.tenantId,
          userId: { in: senderUserIds },
        },
        select: { userId: true, role: true },
      })
    : [];
  const senderRoleByUserId = new Map(senderMemberships.map((membership) => [membership.userId, membership.role]));

  const messages = selectedMessages
    .map((message) => ({
      ...message,
      sentByUser: message.sentByUser
        ? {
            ...message.sentByUser,
            role: message.sentByUserId ? senderRoleByUserId.get(message.sentByUserId) || null : null,
          }
        : null,
    }))
    .sort((left, right) => {
      const leftTime = (left.providerTimestamp ?? left.createdAt).getTime();
      const rightTime = (right.providerTimestamp ?? right.createdAt).getTime();
      if (leftTime !== rightTime) return leftTime - rightTime;
      const createdDelta = left.createdAt.getTime() - right.createdAt.getTime();
      if (createdDelta !== 0) return createdDelta;
      return left.id.localeCompare(right.id);
    });

  // Corrections of messages the team sent: the bubble shows the latest text, marked "editada".
  const ids = messages.map((message) => message.id);
  const edits = ids.length
    ? await prisma.$queryRaw<Array<{ message_id: string; new_text: string; total: bigint }>>(Prisma.sql`
      SELECT DISTINCT ON (message_id) message_id, new_text, COUNT(*) OVER (PARTITION BY message_id) AS total
      FROM message_edits WHERE tenant_id = ${session.tenantId} AND message_id IN (${Prisma.join(ids)})
      ORDER BY message_id, created_at DESC`).catch(() => [])
    : [];
  const editOf = new Map(edits.map((edit) => [edit.message_id, { text: edit.new_text, count: Number(edit.total) }]));

  return NextResponse.json({
    conversation,
    messages: messages.map((message) => {
      const edit = editOf.get(message.id);
      return edit ? { ...message, originalText: message.text, text: edit.text, editCount: edit.count } : message;
    }),
  });
});
