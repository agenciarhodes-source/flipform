import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';

/** Marks a review of the AI as resolved. */
export const POST = withPermission('FLIP_AI_MANAGE', async (_req: NextRequest, session, ctx: { params: { id: string } }) => {
  const updated = await prisma.flipAiConversationReview.updateMany({
    where: { id: ctx.params.id, tenantId: session.tenantId, status: 'new' },
    data: { status: 'resolved', resolvedBy: session.userId, resolvedAt: new Date() },
  });
  if (!updated.count) return NextResponse.json({ error: 'Revisão não encontrada.' }, { status: 404 });
  await prisma.auditLog.create({
    data: { tenantId: session.tenantId, userId: session.userId, entityType: 'flip_ai_conversation_review', entityId: ctx.params.id, action: 'whatsapp_ai.review_resolved' },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true });
});
