import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { attachmentContentDisposition } from '@/lib/storage/attachment-storage';
import { sampleValues } from '@/lib/closing-documents/rules';
import { fillDocx } from '@/lib/closing-documents/docx';
import { DOCX_MIME, readClosingTemplate } from '@/lib/closing-documents/store';

export const maxDuration = 30;

/** The model filled with example data, to check before switching on. */
export const GET = withPermission('FLIP_AI_MANAGE', async (_req: NextRequest, session, ctx: { params: { id: string } }) => {
  const template = await readClosingTemplate(session.tenantId, ctx.params.id);
  if (!template) return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 });
  const filled = fillDocx(template.bytes, sampleValues(new Date()));
  return new NextResponse(Buffer.from(filled.bytes), {
    headers: {
      'Content-Type': DOCX_MIME,
      'Content-Disposition': attachmentContentDisposition(`Exemplo - ${template.name}.docx`),
      'Cache-Control': 'no-store',
    },
  });
});
