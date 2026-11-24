import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { findAccessibleInboxConversation } from '@/lib/inbox/access';
import { connectionAccessToken } from '@/lib/meta/whatsapp-connection-token';
import { getPlatformWhatsAppRuntimeCredentials } from '@/lib/meta/platform-settings';
import { downloadWhatsAppMedia, WhatsAppMediaError } from '@/lib/meta/whatsapp-media';
import { createAttachmentDownloadUrl, readAttachmentObject, resolveAttachmentStorage } from '@/lib/storage/attachment-storage';
import { contentDisposition, mediaDownloadName, requestedRange, SERVE_INLINE_MAX_BYTES } from '@/lib/inbox/media-file-rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function metadataOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * Sends the file from FlipForm, whole or the part the player asked for (206), so an audio or a
 * video can be paused, played again and moved forward at any time.
 */
function fileResponse(req: NextRequest, bytes: Uint8Array, input: { mimeType: string; disposition: string }) {
  const size = bytes.byteLength;
  const headers: Record<string, string> = {
    'Content-Type': input.mimeType,
    'Content-Disposition': input.disposition,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  };
  const range = requestedRange(req.headers.get('range'), size);
  if (range === 'invalid') {
    return new NextResponse(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
  }
  const part = range ? bytes.subarray(range.start, range.end + 1) : bytes;
  const body = part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as ArrayBuffer;
  return new NextResponse(body, {
    status: range ? 206 : 200,
    headers: {
      ...headers,
      'Content-Length': String(part.byteLength),
      ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${size}` } : {}),
    },
  });
}

/**
 * The photo, audio, video or document of one WhatsApp message, for whoever may see that
 * conversation in the Inbox. The kept copy (private storage, 5 years) comes first, so the file
 * still opens after Meta drops it (30 days) or the customer deletes it; otherwise it is read from
 * Meta. `?download=1` saves it with a proper name, on any phone or computer.
 */
export const GET = withPermission('INBOX_VIEW', async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  const message = await prisma.message.findFirst({
    where: { id: ctx.params.id, tenantId: session.tenantId, provider: 'meta', channel: 'whatsapp' },
    select: { id: true, conversationId: true, type: true, metadata: true, createdAt: true },
  });
  if (!message) return NextResponse.json({ error: 'Mensagem não encontrada.' }, { status: 404 });
  const conversation = await findAccessibleInboxConversation(session, message.conversationId);
  if (!conversation) return NextResponse.json({ error: 'Mensagem não encontrada.' }, { status: 404 });

  const metadata = metadataOf(message.metadata);
  const download = req.nextUrl.searchParams.get('download') === '1';
  const givenName = typeof metadata.mediaFileName === 'string' ? metadata.mediaFileName : null;

  // The copy kept in the private storage.
  const storage = resolveAttachmentStorage();
  const copy = storage.ready
    ? await prisma.chatAttachment.findFirst({
      where: { tenantId: session.tenantId, conversationId: message.conversationId, clientMessageId: message.id, status: 'ready', expiresAt: { gt: new Date() } },
      select: { objectKey: true, mimeType: true, sizeBytes: true },
    }).catch(() => null)
    : null;
  if (copy && storage.ready) {
    const name = mediaDownloadName({ type: message.type, fileName: givenName, mimeType: copy.mimeType, sentAt: message.createdAt });
    // Voice notes, photos and small files go out from FlipForm itself: a link of the storage
    // expires in one minute, and a player asking for the rest of an audio later got nothing.
    if (copy.sizeBytes <= SERVE_INLINE_MAX_BYTES) {
      const bytes = await readAttachmentObject(storage.config, { key: copy.objectKey, maxBytes: SERVE_INLINE_MAX_BYTES }).catch(() => null);
      if (bytes) return fileResponse(req, bytes, { mimeType: copy.mimeType, disposition: contentDisposition(download ? 'attachment' : 'inline', name) });
    }
    const url = createAttachmentDownloadUrl(storage.config, { key: copy.objectKey, ...(download ? { downloadName: name } : {}) });
    // Large files (long videos): straight from the storage. The link lasts one minute and is never cached.
    return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'private, no-store' } });
  }

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
    const name = mediaDownloadName({ type: message.type, fileName: givenName, mimeType: media.mimeType, sentAt: message.createdAt });
    return fileResponse(req, media.bytes, { mimeType: media.mimeType, disposition: contentDisposition(download ? 'attachment' : 'inline', name) });
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
