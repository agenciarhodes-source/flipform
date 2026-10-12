/**
 * A photo or document the visitor attaches to a chat message.
 *
 * The browser sends the file straight to private storage; the server reads it back, checks
 * its real type and size, and gives it to the conversation model for that turn.
 */

export const FLIP_AI_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

export const FLIP_AI_ATTACHMENT_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
  // Voice messages recorded in the chat.
  'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg',
] as const;
export type FlipAiAttachmentMimeType = typeof FLIP_AI_ATTACHMENT_MIME_TYPES[number];
export type FlipAiAttachmentKind = 'image' | 'document' | 'audio';

export function attachmentKindOf(mimeType: string): FlipAiAttachmentKind {
  if (mimeType.startsWith('audio/')) return 'audio';
  return mimeType === 'application/pdf' ? 'document' : 'image';
}

export type FlipAiChatAttachmentInfo = {
  name: string;
  mimeType: FlipAiAttachmentMimeType;
  sizeBytes: number;
  kind: FlipAiAttachmentKind;
};

export type FlipAiChatAttachment = FlipAiChatAttachmentInfo & { base64: string };

export type FlipAiModelContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string }
  | { type: 'input_file'; filename: string; file_data: string };

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

/** The real type of the file, read from its first bytes; the name and declared type are never trusted. */
export function sniffAttachmentMimeType(bytes: Uint8Array): FlipAiAttachmentMimeType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  // Containers a browser records voice in. The declared type must still match what is found here.
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return 'audio/webm';
  if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) return 'audio/mp4';
  if (startsWith(bytes, [0x4f, 0x67, 0x67, 0x53])) return 'audio/ogg';
  if (startsWith(bytes, [0x49, 0x44, 0x33]) || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)) return 'audio/mpeg';
  return null;
}

export function cleanAttachmentName(value: string) {
  const name = value.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return name || 'arquivo';
}

export function validateChatAttachment(input: { name: string; bytes: Uint8Array }):
  | { ok: true; attachment: FlipAiChatAttachment }
  | { ok: false; message: string } {
  if (input.bytes.byteLength === 0) return { ok: false, message: 'O arquivo enviado está vazio.' };
  if (input.bytes.byteLength > FLIP_AI_ATTACHMENT_MAX_BYTES) {
    return { ok: false, message: 'O arquivo é maior que 5 MB. Envie um arquivo menor ou uma foto.' };
  }
  const mimeType = sniffAttachmentMimeType(input.bytes);
  if (!mimeType) return { ok: false, message: 'Envie uma foto (JPG, PNG ou WEBP) ou um documento em PDF.' };
  return {
    ok: true,
    attachment: {
      name: cleanAttachmentName(input.name),
      mimeType,
      sizeBytes: input.bytes.byteLength,
      kind: attachmentKindOf(mimeType),
      base64: Buffer.from(input.bytes).toString('base64'),
    },
  };
}

export function attachmentInfo(attachment: FlipAiChatAttachment): FlipAiChatAttachmentInfo {
  return { name: attachment.name, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes, kind: attachment.kind };
}

/** What the model receives for the visitor's turn: the message plus the file itself. */
export function buildAttachmentModelContent(text: string, attachment: FlipAiChatAttachment): FlipAiModelContentPart[] {
  const dataUrl = `data:${attachment.mimeType};base64,${attachment.base64}`;
  return [
    { type: 'input_text', text },
    attachment.kind === 'image'
      ? { type: 'input_image', image_url: dataUrl }
      : { type: 'input_file', filename: attachment.name, file_data: dataUrl },
  ];
}

/** Used when the provider cannot read the file: the attendant still confirms it arrived. */
export function unreadableAttachmentNote(text: string, attachment: FlipAiChatAttachmentInfo) {
  return [
    text,
    `[Aviso do sistema, não é fala da pessoa: ela anexou o arquivo "${attachment.name}", mas o conteúdo não pôde ser lido. Confirme que o arquivo chegou, não afirme nada sobre o conteúdo e, se precisar conferi-lo, peça uma foto nítida do documento.]`,
  ].join('\n\n');
}
