import { sniffAttachmentMimeType } from '@/lib/flip-ai/chat-attachment';

/**
 * Which files of WhatsApp messages get a kept copy, read from the file itself (not from what the
 * sender declared). HEIC/HEIF photos (the iPhone format, when sent as a document) are kept too.
 * Pure rules, easy to test.
 */

const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs']);
const HEIF_BRANDS = new Set(['mif1', 'msf1', 'heif']);

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

/** An HEIC or HEIF photo: an ISO box "ftyp" whose brand is one of the image brands. */
export function heifMimeType(bytes: Uint8Array) {
  if (bytes.length < 12 || ascii(bytes, 4, 4) !== 'ftyp') return null;
  const brand = ascii(bytes, 8, 4).toLowerCase();
  if (HEIC_BRANDS.has(brand)) return 'image/heic';
  if (HEIF_BRANDS.has(brand)) return 'image/heif';
  return null;
}

/** The type the copy is kept as, or null when this kind of file is not kept. */
export function archiveMimeType(bytes: Uint8Array, messageType: string) {
  const heif = heifMimeType(bytes);
  if (heif) return heif;
  const sniffed = sniffAttachmentMimeType(bytes);
  // "ftyp" files that are not photos are audio only when the message is a voice/audio message.
  if (sniffed === 'audio/mp4' && messageType !== 'audio') return null;
  return sniffed;
}
