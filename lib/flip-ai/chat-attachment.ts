/**
 * A photo or document the visitor attaches to a chat message.
 *
 * The file is read by the conversation model for that turn only. It is not stored: the
 * conversation keeps the file name, its type and size, and what the attendant understood of it.
 */

/** Kept under the request body limit of the hosting platform. */
export const FLIP_AI_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;

export const FLIP_AI_ATTACHMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export type FlipAiAttachmentMimeType = typeof FLIP_AI_ATTACHMENT_MIME_TYPES[number];
export type FlipAiAttachmentKind = 'image' | 'document';

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
    return { ok: false, message: 'O arquivo é maior que 4 MB. Envie um arquivo menor ou uma foto.' };
  }
  const mimeType = sniffAttachmentMimeType(input.bytes);
  if (!mimeType) return { ok: false, message: 'Envie uma foto (JPG, PNG ou WEBP) ou um documento em PDF.' };
  return {
    ok: true,
    attachment: {
      name: cleanAttachmentName(input.name),
      mimeType,
      sizeBytes: input.bytes.byteLength,
      kind: mimeType === 'application/pdf' ? 'document' : 'image',
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
