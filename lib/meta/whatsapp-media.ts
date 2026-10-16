import 'server-only';

import { META_PLATFORM_GRAPH_API_VERSION } from './oauth';

/** Meta keeps a received file for 30 days; the largest WhatsApp document is 100 MB. */
export const WHATSAPP_MEDIA_MAX_BYTES = 100 * 1024 * 1024;

export class WhatsAppMediaError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'TOO_LARGE' | 'UNAVAILABLE') {
    super(code);
  }
}

/**
 * Downloads a file a customer sent on WhatsApp, with the token of the connected account.
 * Meta first returns a short-lived address for the file, which is then read with the same token.
 */
export async function downloadWhatsAppMedia(input: { mediaId: string; accessToken: string }) {
  if (!/^\d{1,64}$/.test(input.mediaId)) throw new WhatsAppMediaError('NOT_FOUND');
  const headers = { Authorization: `Bearer ${input.accessToken}` };

  let info: any;
  try {
    const response = await fetch(`https://graph.facebook.com/${META_PLATFORM_GRAPH_API_VERSION}/${input.mediaId}`, {
      headers, cache: 'no-store', signal: AbortSignal.timeout(10_000),
    });
    info = await response.json().catch(() => null);
    if (!response.ok || typeof info?.url !== 'string') {
      throw new WhatsAppMediaError(response.status === 404 || response.status === 400 ? 'NOT_FOUND' : 'UNAVAILABLE');
    }
  } catch (error) {
    if (error instanceof WhatsAppMediaError) throw error;
    throw new WhatsAppMediaError('UNAVAILABLE');
  }
  if (typeof info.file_size === 'number' && info.file_size > WHATSAPP_MEDIA_MAX_BYTES) throw new WhatsAppMediaError('TOO_LARGE');

  let file: Response;
  try {
    file = await fetch(info.url, { headers, cache: 'no-store', signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new WhatsAppMediaError('UNAVAILABLE');
  }
  if (!file.ok) throw new WhatsAppMediaError('UNAVAILABLE');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > WHATSAPP_MEDIA_MAX_BYTES) throw new WhatsAppMediaError('TOO_LARGE');
  return {
    bytes,
    mimeType: typeof info.mime_type === 'string' ? info.mime_type : file.headers.get('content-type') || 'application/octet-stream',
  };
}
