import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { CLOSING_MAX_BYTES } from '@/lib/closing-documents/rules';
import { addClosingTemplate, ClosingDocumentError } from '@/lib/closing-documents/store';

export const maxDuration = 60;

/** Sends one Word model. */
export const POST = withPermission('FLIP_AI_MANAGE', async (req: NextRequest, session) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Escolha o arquivo do modelo.' }, { status: 400 });
  if (file.size > CLOSING_MAX_BYTES) return NextResponse.json({ error: 'O arquivo pode ter até 4 MB.' }, { status: 400 });
  try {
    const result = await addClosingTemplate({
      tenantId: session.tenantId, userId: session.userId, fileName: file.name || 'Documento.docx',
      bytes: new Uint8Array(await file.arrayBuffer()),
      checklistIds: (form?.getAll('checklistId') || []).filter((value): value is string => typeof value === 'string'),
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.tenantId, userId: session.userId, entityType: 'closing_document_template', entityId: result.id,
        action: 'closing_documents.template_added', metadata: { kind: result.kind, known: result.known, unknown: result.unknown },
      },
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ClosingDocumentError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
});
