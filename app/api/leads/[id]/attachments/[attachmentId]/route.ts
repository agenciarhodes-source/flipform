import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission, assertCanAccessLead } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import {
  canDeleteChatAttachment,
  createLeadChatAttachmentDownload,
  deleteLeadChatAttachment,
} from '@/lib/flip-ai/chat-attachment-library';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
type Context = { params: { id: string; attachmentId: string } };

/** Sends the browser to a one-minute download link. Same access rules as opening the lead. */
export const GET = withPermission('LEADS_VIEW', async (_req, session, ctx: Context) => {
  const lead = await prisma.lead.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404, headers: NO_STORE });
  try {
    assertCanAccessLead(session, lead);
  } catch {
    return NextResponse.json({ error: 'Você não tem permissão para acessar este lead.' }, { status: 403, headers: NO_STORE });
  }

  const download = await createLeadChatAttachmentDownload({
    tenantId: session.tenantId,
    leadId: lead.id,
    attachmentId: ctx.params.attachmentId,
  }).catch(() => null);
  if (!download) {
    return NextResponse.json({ error: 'Arquivo não encontrado ou já expirado.' }, { status: 404, headers: NO_STORE });
  }

  await logAudit({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: 'lead',
    entityId: lead.id,
    action: 'lead.chat_attachment_downloaded',
    metadata: { attachmentId: download.id, name: download.name, sizeBytes: download.sizeBytes },
  });
  return NextResponse.redirect(download.url, { status: 302, headers: NO_STORE });
});

/** Deletes a file before it expires. Only senior roles; attendants cannot. */
export const DELETE = withPermission('LEADS_VIEW', async (_req, session, ctx: Context) => {
  if (!canDeleteChatAttachment(session.role)) {
    return NextResponse.json(
      { error: 'Apenas dono, administrador ou gestor podem apagar arquivos.' },
      { status: 403, headers: NO_STORE },
    );
  }
  const lead = await prisma.lead.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404, headers: NO_STORE });
  try {
    assertCanAccessLead(session, lead);
  } catch {
    return NextResponse.json({ error: 'Você não tem permissão para acessar este lead.' }, { status: 403, headers: NO_STORE });
  }

  try {
    const removed = await deleteLeadChatAttachment({
      tenantId: session.tenantId,
      leadId: lead.id,
      attachmentId: ctx.params.attachmentId,
      userId: session.userId,
    });
    if (!removed) {
      return NextResponse.json({ error: 'Arquivo não encontrado ou já expirado.' }, { status: 404, headers: NO_STORE });
    }
    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      entityType: 'lead',
      entityId: lead.id,
      action: 'lead.chat_attachment_deleted',
      metadata: { attachmentId: removed.id, name: removed.name },
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { error: 'Não foi possível apagar o arquivo agora. Tente novamente.' },
      { status: 502, headers: NO_STORE },
    );
  }
});
