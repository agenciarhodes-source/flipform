/**
 * Names and headers for files of WhatsApp messages, so they download on any phone: a plain
 * name every browser understands (and the full UTF-8 one for those that read it) and an
 * extension that matches the file. Pure rules, easy to test.
 */

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic',
  'application/pdf': 'pdf', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
  'audio/amr': 'amr', 'video/mp4': 'mp4', 'video/3gpp': '3gp',
  'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};
const LABELS: Record<string, string> = { image: 'Foto', audio: 'Audio', video: 'Video', document: 'Documento', sticker: 'Figurinha' };

export function extensionFor(mimeType: string) {
  return EXTENSIONS[mimeType.split(';')[0]!.trim().toLowerCase()] || '';
}

/** "Foto 11-11-2026 15h09.jpg", or the name the customer gave the file (with its extension). */
export function mediaDownloadName(input: { type: string; fileName?: string | null; mimeType: string; sentAt: Date }) {
  const extension = extensionFor(input.mimeType);
  const given = (input.fileName || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (given) return /\.[a-z0-9]{2,5}$/i.test(given) || !extension ? given : `${given}.${extension}`;
  const when = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).formatToParts(input.sentAt);
  const part = (type: string) => when.find((item) => item.type === type)?.value || '';
  const stamp = `${part('day')}-${part('month')}-${part('year')} ${part('hour')}h${part('minute')}`;
  return `${LABELS[input.type] || 'Arquivo'} ${stamp}${extension ? `.${extension}` : ''}`;
}

function encodeRfc5987(value: string) {
  return encodeURIComponent(value).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Content-Disposition with a plain ASCII name (older phone browsers) and the UTF-8 one. */
export function contentDisposition(kind: 'inline' | 'attachment', name: string) {
  const ascii = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeRfc5987(name)}`;
}

/**
 * Files up to this size are sent by FlipForm itself (below the 4.5 MB response limit of the
 * server), so a player that asks for parts of an audio or video later still gets them. Larger
 * files go straight from the storage.
 */
export const SERVE_INLINE_MAX_BYTES = 4 * 1024 * 1024;

/**
 * The part of the file a player asked for ("Range: bytes=start-end"): null for the whole file,
 * 'invalid' when the part is outside the file (answered with 416).
 */
export function requestedRange(header: string | null, size: number): { start: number; end: number } | null | 'invalid' {
  if (!header || size <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;
  let start: number;
  let end: number;
  if (!match[1]) {
    // "bytes=-500": the last 500 bytes.
    const suffix = Number(match[2]);
    if (!suffix) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (start >= size || end < start) return 'invalid';
  return { start, end };
}

/** Chunked audio transport avoids expiring playback links and the Vercel response ceiling. */
export const AUDIO_CHUNK_BYTES=2*1024*1024;
export const AUDIO_PLAYBACK_MAX_BYTES=32*1024*1024;
export function audioChunkRange(header:string|null,size:number){
  if(!header||!/^bytes=\d+-\d+$/.test(header)||!Number.isSafeInteger(size)||size<1||size>AUDIO_PLAYBACK_MAX_BYTES)return null;
  const range=requestedRange(header,size);
  return range&&range!=='invalid'&&Number.isSafeInteger(range.start)&&Number.isSafeInteger(range.end)&&range.end-range.start+1<=AUDIO_CHUNK_BYTES?range:null;
}
