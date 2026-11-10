import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { closingSituationSchema } from '@/lib/closing-documents/rules';
import { deleteClosingTemplate, setClosingTemplateChecklists, setClosingTemplateSituation } from '@/lib/closing-documents/store';

/** Which case types the file is for, or which customers (adult, minor, a rogo or everyone). */
export const PATCH = withPermission('FLIP_AI_MANAGE', async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  const body = await req.json().catch(() => null);
  if (Array.isArray(body?.checklistIds)) {
    const ids = body.checklistIds.filter((value: unknown): value is string => typeof value === 'string');
    const changed = await setClosingTemplateChecklists(session.tenantId, ctx.params.id, ids);
    if (!changed) return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }
  const parsed = closingSituationSchema.safeParse(body?.situation);
  if (!parsed.success) return NextResponse.json({ error: 'Situação inválida.' }, { status: 400 });
  const changed = await setClosingTemplateSituation(session.tenantId, ctx.params.id, parsed.data);
  if (!changed) return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 });
  return NextResponse.json({ ok: true });
});

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
