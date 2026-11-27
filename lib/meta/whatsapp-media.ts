import 'server-only';
import { createHash } from 'node:crypto';

import { META_PLATFORM_GRAPH_API_VERSION } from './oauth';
import { assertPr629NoExternalEgress } from '@/lib/qa/pr629-external-egress';

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
export async function downloadWhatsAppMedia(input: { mediaId: string; accessToken: string; maxBytes?:number }) {
  assertPr629NoExternalEgress('whatsapp-media-download');
  if (!/^\d{1,64}$/.test(input.mediaId)) throw new WhatsAppMediaError('NOT_FOUND');
  const headers = { Authorization: `Bearer ${input.accessToken}` };
  const maxBytes=Math.min(WHATSAPP_MEDIA_MAX_BYTES,input.maxBytes??WHATSAPP_MEDIA_MAX_BYTES);

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
  if (typeof info.file_size === 'number' && info.file_size > maxBytes) throw new WhatsAppMediaError('TOO_LARGE');

  let file: Response;
  try {
    file = await fetch(info.url, { headers, cache: 'no-store', signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new WhatsAppMediaError('UNAVAILABLE');
  }
  if (!file.ok) throw new WhatsAppMediaError('UNAVAILABLE');
  const declared = file.headers.get('content-length');
  if(declared!==null && Number(declared)>maxBytes)throw new WhatsAppMediaError('TOO_LARGE');
  if(!file.body)throw new WhatsAppMediaError('UNAVAILABLE');
  const reader=file.body.getReader();const parts:Uint8Array[]=[];let size=0;
  try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>maxBytes)throw new WhatsAppMediaError('TOO_LARGE');parts.push(chunk.value);}}
  catch(error){if(error instanceof WhatsAppMediaError)throw error;throw new WhatsAppMediaError('UNAVAILABLE');}
  finally{await reader.cancel().catch(()=>undefined);}
  const bytes=new Uint8Array(Buffer.concat(parts,size));
  if(!size || (Number.isSafeInteger(info.file_size)&&info.file_size!==size) || (declared!==null&&Number(declared)!==size))throw new WhatsAppMediaError('UNAVAILABLE');
  if(typeof info.sha256==='string'){
    const digest=createHash('sha256').update(bytes).digest();
    const expected=info.sha256;
    if(![digest.toString('hex'),digest.toString('base64'),digest.toString('base64url')].includes(expected))throw new WhatsAppMediaError('UNAVAILABLE');
  }
  return {
    bytes,
    mimeType: typeof info.mime_type === 'string' ? info.mime_type : file.headers.get('content-type') || 'application/octet-stream',
  };
}

/** Uploads a file to Meta for the connected number and returns its media id (used to send it). */
export async function uploadWhatsAppMedia(input: {
  phoneNumberId: string;
  accessToken: string;
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
}) {
  assertPr629NoExternalEgress('whatsapp-media-upload');
  if (!/^\d{1,64}$/.test(input.phoneNumberId)) throw new WhatsAppMediaError('UNAVAILABLE');
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', input.mimeType);
  const buffer = input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength) as ArrayBuffer;
  form.append('file', new Blob([buffer], { type: input.mimeType }), input.fileName);
  let data: any = null;
  try {
    const response = await fetch(`https://graph.facebook.com/${META_PLATFORM_GRAPH_API_VERSION}/${input.phoneNumberId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.accessToken}` },
      body: form,
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    });
    data = await response.json().catch(() => null);
    if (!response.ok || typeof data?.id !== 'string') throw new WhatsAppMediaError('UNAVAILABLE');
  } catch (error) {
    if (error instanceof WhatsAppMediaError) throw error;
    throw new WhatsAppMediaError('UNAVAILABLE');
  }
  return data.id as string;
}
