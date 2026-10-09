import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission, assertCanAccessLead } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { loadLeadChatAttachment } from '@/lib/flip-ai/chat-attachment-storage';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/** Downloads a file the lead sent in the chat. Same access rules as opening the lead. */
export const GET = withPermission('LEADS_VIEW', async (
  _req,
  session,
  ctx: { params: { id: string; attachmentId: string } },
) => {
  const lead = await prisma.lead.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404, headers: NO_STORE });
  try {
    assertCanAccessLead(session, lead);
  } catch {
    return NextResponse.json({ error: 'Você não tem permissão para acessar este lead.' }, { status: 403, headers: NO_STORE });
  }

  const file = await loadLeadChatAttachment({
    tenantId: session.tenantId,
    leadId: lead.id,
    attachmentId: ctx.params.attachmentId,
  }).catch(() => null);
  if (!file) {
    return NextResponse.json(
      { error: 'Arquivo não encontrado ou já expirado.' },
      { status: 404, headers: NO_STORE },
    );
  }

  await logAudit({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: 'lead',
    entityId: lead.id,
    action: 'lead.flip_ai_attachment_downloaded',
    metadata: { attachmentId: file.id, name: file.name, sizeBytes: file.sizeBytes },
  });

  const asciiName = file.name.replace(/[^\x20-\x7e]+/g, '_').replace(/["\\]/g, '_');
  return new NextResponse(new Uint8Array(file.content), {
    headers: {
      ...NO_STORE,
      'Content-Type': file.mimeType,
      'Content-Length': String(file.sizeBytes),
      // Always a download, never rendered inside the application.
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
