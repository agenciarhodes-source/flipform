import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { deleteClosingTemplate } from '@/lib/closing-documents/store';

/** Deletes one model. */
export const DELETE = withPermission('FLIP_AI_MANAGE', async (_req: NextRequest, session, ctx: { params: { id: string } }) => {
  const deleted = await deleteClosingTemplate(session.tenantId, ctx.params.id);
  if (!deleted) return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 });
  await prisma.auditLog.create({
    data: {
      tenantId: session.tenantId, userId: session.userId, entityType: 'closing_document_template', entityId: ctx.params.id,
      action: 'closing_documents.template_deleted', metadata: {},
    },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true });
});
