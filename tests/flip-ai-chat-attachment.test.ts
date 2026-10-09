import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FLIP_AI_ATTACHMENT_MAX_BYTES,
  buildAttachmentModelContent,
  cleanAttachmentName,
  sniffAttachmentMimeType,
  unreadableAttachmentNote,
  validateChatAttachment,
} from '../lib/flip-ai/chat-attachment';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

test('o tipo do arquivo vem dos bytes, não do nome', () => {
  assert.equal(sniffAttachmentMimeType(PNG), 'image/png');
  assert.equal(sniffAttachmentMimeType(JPEG), 'image/jpeg');
  assert.equal(sniffAttachmentMimeType(PDF), 'application/pdf');
  assert.equal(sniffAttachmentMimeType(WEBP), 'image/webp');
  assert.equal(sniffAttachmentMimeType(new TextEncoder().encode('<html><script>')), null);
  const disguised = validateChatAttachment({ name: 'foto.png', bytes: new TextEncoder().encode('MZ executable') });
  assert.equal(disguised.ok, false);
});

test('arquivo vazio ou grande demais é recusado com mensagem clara', () => {
  assert.equal(validateChatAttachment({ name: 'a.png', bytes: new Uint8Array() }).ok, false);
  const big = new Uint8Array(FLIP_AI_ATTACHMENT_MAX_BYTES + 1);
  big.set(PNG);
  const result = validateChatAttachment({ name: 'a.png', bytes: big });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /4 MB/);
});

test('foto vai como imagem e PDF como arquivo, junto com a mensagem da pessoa', () => {
  const photo = validateChatAttachment({ name: 'rg.png', bytes: PNG });
  assert.equal(photo.ok, true);
  if (!photo.ok) return;
  assert.equal(photo.attachment.kind, 'image');
  const parts = buildAttachmentModelContent('Segue meu RG', photo.attachment);
  assert.deepEqual(parts[0], { type: 'input_text', text: 'Segue meu RG' });
  assert.equal(parts[1]?.type, 'input_image');

  const pdf = validateChatAttachment({ name: 'contrato.pdf', bytes: PDF });
  assert.equal(pdf.ok, true);
  if (!pdf.ok) return;
  assert.equal(pdf.attachment.kind, 'document');
  const pdfPart = buildAttachmentModelContent('Veja', pdf.attachment)[1];
  assert.equal(pdfPart?.type, 'input_file');
  if (pdfPart?.type === 'input_file') assert.match(pdfPart.file_data, /^data:application\/pdf;base64,/);
});

test('nome do arquivo é limpo e o aviso de arquivo ilegível não inventa conteúdo', () => {
  assert.equal(cleanAttachmentName('../../etc/passwd'), '.. .. etc passwd');
  assert.equal(cleanAttachmentName('   '), 'arquivo');
  const note = unreadableAttachmentNote('Segue', { name: 'doc.pdf', mimeType: 'application/pdf', sizeBytes: 10, kind: 'document' });
  assert.match(note, /^Segue/);
  assert.match(note, /não pôde ser lido/);
  assert.match(note, /não afirme nada sobre o conteúdo/);
});
