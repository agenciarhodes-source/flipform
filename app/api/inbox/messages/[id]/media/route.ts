import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { findAccessibleInboxConversation } from '@/lib/inbox/access';
import { connectionAccessToken } from '@/lib/meta/whatsapp-connection-token';
import { getPlatformWhatsAppRuntimeCredentials } from '@/lib/meta/platform-settings';
import { downloadWhatsAppMedia, WhatsAppMediaError } from '@/lib/meta/whatsapp-media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function metadataOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * The photo, audio, video or document of one WhatsApp message, for whoever may see that
 * conversation in the Inbox. The file is read from Meta when asked and is not stored.
 */
export const GET = withPermission('INBOX_VIEW', async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  const message = await prisma.message.findFirst({
    where: { id: ctx.params.id, tenantId: session.tenantId, provider: 'meta', channel: 'whatsapp' },
    select: { id: true, conversationId: true, type: true, metadata: true },
  });
  if (!message) return NextResponse.json({ error: 'Mensagem não encontrada.' }, { status: 404 });
  const conversation = await findAccessibleInboxConversation(session, message.conversationId);
  if (!conversation) return NextResponse.json({ error: 'Mensagem não encontrada.' }, { status: 404 });

  const metadata = metadataOf(message.metadata);
  const mediaId = typeof metadata.mediaId === 'string' ? metadata.mediaId : '';
  const phoneNumberId = typeof metadata.phoneNumberId === 'string' ? metadata.phoneNumberId : '';
  if (!mediaId) return NextResponse.json({ error: 'Esta mensagem não tem arquivo.' }, { status: 404 });

  // The account the message came through: its own token, or the platform credential for older ones.
  const connection = phoneNumberId
    ? await prisma.tenantWhatsAppConnection.findFirst({
      where: { tenantId: session.tenantId, phoneNumberId },
      select: { accessTokenEncrypted: true },
    })
    : null;
  const accessToken = connectionAccessToken(connection?.accessTokenEncrypted)
    || (await getPlatformWhatsAppRuntimeCredentials())?.systemUserAccessToken;
  if (!accessToken) return NextResponse.json({ error: 'WhatsApp não conectado para esta empresa.' }, { status: 409 });

  try {
    const media = await downloadWhatsAppMedia({ mediaId, accessToken });
    const fileName = typeof metadata.mediaFileName === 'string' ? metadata.mediaFileName : '';
    const download = req.nextUrl.searchParams.get('download') === '1';
    const disposition = `${download ? 'attachment' : 'inline'}${fileName ? `; filename*=UTF-8''${encodeURIComponent(fileName)}` : ''}`;
    return new NextResponse(media.bytes.buffer.slice(media.bytes.byteOffset, media.bytes.byteOffset + media.bytes.byteLength) as ArrayBuffer, {
      headers: {
        'Content-Type': media.mimeType,
        'Content-Length': String(media.bytes.byteLength),
        'Content-Disposition': disposition,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof WhatsAppMediaError && error.code === 'NOT_FOUND') {
      return NextResponse.json({ error: 'O arquivo não está mais disponível na Meta (ela guarda por 30 dias).' }, { status: 410 });
    }
    if (error instanceof WhatsAppMediaError && error.code === 'TOO_LARGE') {
      return NextResponse.json({ error: 'Arquivo grande demais para abrir aqui.' }, { status: 413 });
    }
    return NextResponse.json({ error: 'Não foi possível buscar o arquivo na Meta agora.' }, { status: 502 });
  }
});
