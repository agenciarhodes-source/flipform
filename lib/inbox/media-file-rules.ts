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
