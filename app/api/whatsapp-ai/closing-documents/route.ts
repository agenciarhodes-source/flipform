import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { closingSettingsSchema, CLOSING_FIELDS } from '@/lib/closing-documents/rules';
import { closingDocuments, saveClosingSettings } from '@/lib/closing-documents/store';

/** "Documentos para finalizar o atendimento": the models and when to send them. */
export const GET = withPermission('FLIP_AI_MANAGE', async (_req: NextRequest, session) => {
  const data = await closingDocuments(session.tenantId);
  return NextResponse.json({ ...data, fields: CLOSING_FIELDS.map((field) => ({ key: field.key, label: field.label })) });
});

export const PUT = withPermission('FLIP_AI_MANAGE', async (req: NextRequest, session) => {
  const parsed = closingSettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Configuração inválida.' }, { status: 400 });
  const current = await closingDocuments(session.tenantId);
  if (!current.ready) return NextResponse.json({ error: 'Os documentos de finalização ainda não foram instalados no banco.' }, { status: 409 });
  if (parsed.data.enabled && !current.templates.length) {
    return NextResponse.json({ error: 'Envie pelo menos um modelo antes de ligar.' }, { status: 400 });
  }
  await saveClosingSettings({ tenantId: session.tenantId, userId: session.userId, ...parsed.data });
  await prisma.auditLog.create({
    data: {
      tenantId: session.tenantId, userId: session.userId, entityType: 'closing_documents', entityId: session.tenantId,
      action: 'closing_documents.settings_updated', metadata: { enabled: parsed.data.enabled },
    },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true });
});
