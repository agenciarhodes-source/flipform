/**
 * Files a person of the team sends to the customer from the Inbox (WhatsApp): documents, photos
 * and short videos. Limits follow WhatsApp: photos up to 5 MB, videos and documents up to 16 MB
 * (the size the private copy keeps). Pure rules, so they are easy to test.
 */

export type OutboundFileKind = 'document' | 'image' | 'video';

const MB = 1024 * 1024;

export const OUTBOUND_FILE_TYPES: Record<string, { kind: OutboundFileKind; maxBytes: number; extension: string }> = {
  'application/pdf': { kind: 'document', maxBytes: 16 * MB, extension: 'pdf' },
  'application/msword': { kind: 'document', maxBytes: 16 * MB, extension: 'doc' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { kind: 'document', maxBytes: 16 * MB, extension: 'docx' },
  'application/vnd.ms-excel': { kind: 'document', maxBytes: 16 * MB, extension: 'xls' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { kind: 'document', maxBytes: 16 * MB, extension: 'xlsx' },
  'application/vnd.ms-powerpoint': { kind: 'document', maxBytes: 16 * MB, extension: 'ppt' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { kind: 'document', maxBytes: 16 * MB, extension: 'pptx' },
  'text/plain': { kind: 'document', maxBytes: 16 * MB, extension: 'txt' },
  'image/jpeg': { kind: 'image', maxBytes: 5 * MB, extension: 'jpg' },
  'image/png': { kind: 'image', maxBytes: 5 * MB, extension: 'png' },
  'video/mp4': { kind: 'video', maxBytes: 16 * MB, extension: 'mp4' },
  'video/3gpp': { kind: 'video', maxBytes: 16 * MB, extension: '3gp' },
};

/** The `accept` of the file picker. */
export const OUTBOUND_FILE_ACCEPT = Object.keys(OUTBOUND_FILE_TYPES).join(',');

export type OutboundFileCheck =
  | { ok: true; kind: OutboundFileKind; mimeType: string; sizeBytes: number; name: string }
  | { ok: false; error: string };

/** A file name safe to show and to send: no folders, no control characters, at most 120 characters. */
export function cleanOutboundFileName(name: string, extension: string) {
  const base = String(name || '').split(/[\\/]/).pop() || '';
  const clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!clean || clean.startsWith('.')) return `arquivo.${extension}`;
  return clean;
}

/** Checks what the browser declared before the upload link is issued. */
export function checkOutboundFile(input: { name: unknown; mimeType: unknown; sizeBytes: unknown }): OutboundFileCheck {
  const mimeType = typeof input.mimeType === 'string' ? input.mimeType.trim().toLowerCase() : '';
  const type = OUTBOUND_FILE_TYPES[mimeType];
  if (!type) return { ok: false, error: 'Tipo de arquivo não aceito. Envie PDF, Word, Excel, PowerPoint, foto (JPG/PNG) ou vídeo (MP4).' };
  const sizeBytes = typeof input.sizeBytes === 'number' ? Math.trunc(input.sizeBytes) : Number.NaN;
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) return { ok: false, error: 'O arquivo está vazio.' };
  if (sizeBytes > type.maxBytes) {
    return { ok: false, error: `O arquivo passou do limite do WhatsApp (${Math.round(type.maxBytes / MB)} MB para ${type.kind === 'image' ? 'fotos' : type.kind === 'video' ? 'vídeos' : 'documentos'}).` };
  }
  return { ok: true, kind: type.kind, mimeType, sizeBytes, name: cleanOutboundFileName(typeof input.name === 'string' ? input.name : '', type.extension) };
}

/**
 * The first bytes must match the declared type, so a renamed file is refused. Office files are
 * ZIP (new) or OLE (old) containers; plain text has no signature.
 */
export function fileMatchesType(bytes: Uint8Array, mimeType: string) {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  const kind = OUTBOUND_FILE_TYPES[mimeType];
  if (!kind || bytes.byteLength < 4) return false;
  if (mimeType === 'application/pdf') return starts(0x25, 0x50, 0x44, 0x46);
  if (mimeType === 'image/jpeg') return starts(0xff, 0xd8, 0xff);
  if (mimeType === 'image/png') return starts(0x89, 0x50, 0x4e, 0x47);
  if (kind.kind === 'video') return bytes.byteLength >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp';
  if (mimeType === 'text/plain') return true;
  if (/openxmlformats/.test(mimeType)) return starts(0x50, 0x4b, 0x03, 0x04);
  return starts(0xd0, 0xcf, 0x11, 0xe0);
}

/** What the Inbox shows in the bubble of the sent file. */
export function outboundFileLabel(kind: OutboundFileKind, name: string) {
  if (kind === 'image') return `🖼️ ${name}`;
  if (kind === 'video') return `🎬 ${name}`;
  return `📄 ${name}`;
}
