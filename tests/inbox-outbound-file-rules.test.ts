import assert from 'node:assert/strict';
import test from 'node:test';

import { checkOutboundFile, checkDirectFile, directFileTransportLimit, DIRECT_FILE_STANDARD_BYTES, DIRECT_FILE_LARGE_BYTES, cleanOutboundFileName, fileMatchesType, outboundFileLabel } from '../lib/inbox/outbound-file-rules';

const MB = 1024 * 1024;

test('aceita documentos, fotos e vídeos dentro do limite do WhatsApp', () => {
  const pdf = checkOutboundFile({ name: 'CNPJ JUNQUEIRA.pdf', mimeType: 'application/pdf', sizeBytes: 300_000 });
  assert.deepEqual(pdf, { ok: true, kind: 'document', mimeType: 'application/pdf', sizeBytes: 300_000, name: 'CNPJ JUNQUEIRA.pdf' });
  const video = checkOutboundFile({ name: 'escritorio.mp4', mimeType: 'video/mp4', sizeBytes: 15 * MB });
  assert.equal(video.ok && video.kind, 'video');
  const photo = checkOutboundFile({ name: 'fachada.jpg', mimeType: 'IMAGE/JPEG', sizeBytes: 2 * MB });
  assert.equal(photo.ok && photo.kind, 'image');
});

test('recusa tipo não aceito, arquivo vazio e acima do limite', () => {
  assert.equal(checkOutboundFile({ name: 'a.exe', mimeType: 'application/x-msdownload', sizeBytes: 10 }).ok, false);
  assert.equal(checkOutboundFile({ name: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 0 }).ok, false);
  const big = checkOutboundFile({ name: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 6 * MB });
  assert.equal(big.ok, false);
  assert.match(big.ok ? '' : big.error, /5 MB para fotos/);
  assert.equal(checkOutboundFile({ name: 'a.mp4', mimeType: 'video/mp4', sizeBytes: 17 * MB }).ok, false);
});

test('nome do arquivo limpo, sem pastas nem caracteres proibidos', () => {
  assert.equal(cleanOutboundFileName('C:/fakepath/contrato<1>.pdf', 'pdf'), 'contrato1.pdf');
  assert.equal(cleanOutboundFileName('', 'pdf'), 'arquivo.pdf');
  assert.equal(cleanOutboundFileName('.env', 'txt'), 'arquivo.txt');
  assert.equal(cleanOutboundFileName('x'.repeat(200), 'pdf').length, 120);
});

test('o conteúdo precisa ser do tipo declarado', () => {
  const bytes = (...values: number[]) => new Uint8Array([...values, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(fileMatchesType(bytes(0x25, 0x50, 0x44, 0x46), 'application/pdf'), true);
  assert.equal(fileMatchesType(bytes(0x4d, 0x5a, 0x90, 0x00), 'application/pdf'), false);
  assert.equal(fileMatchesType(bytes(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg'), true);
  assert.equal(fileMatchesType(bytes(0x89, 0x50, 0x4e, 0x47), 'image/png'), true);
  const mp4 = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  assert.equal(fileMatchesType(mp4, 'video/mp4'), true);
  assert.equal(fileMatchesType(bytes(0x50, 0x4b, 0x03, 0x04), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), true);
  assert.equal(fileMatchesType(bytes(0xd0, 0xcf, 0x11, 0xe0), 'application/msword'), true);
  assert.equal(fileMatchesType(bytes(0x25, 0x50, 0x44, 0x46), 'application/x-msdownload'), false);
});

test('rótulo da mensagem no Inbox', () => {
  assert.equal(outboundFileLabel('document', 'CNPJ.pdf'), '📄 CNPJ.pdf');
  assert.equal(outboundFileLabel('image', 'fachada.jpg'), '🖼️ fachada.jpg');
  assert.equal(outboundFileLabel('video', 'tour.mp4'), '🎬 tour.mp4');
});

test('direct transfer defaults to 4 MiB; large beta needs both flags',()=>{const file={name:'tour.mp4',mimeType:'video/mp4',sizeBytes:16*MB};assert.equal(directFileTransportLimit({}),DIRECT_FILE_STANDARD_BYTES);assert.equal(checkDirectFile(file,DIRECT_FILE_STANDARD_BYTES).ok,false);assert.equal(directFileTransportLimit({VERCEL_SUPPORT_LARGE_REQUEST_BODY:'1'}),DIRECT_FILE_STANDARD_BYTES);assert.equal(directFileTransportLimit({VERCEL_SUPPORT_LARGE_REQUEST_BODY:'1',INBOX_DIRECT_LARGE_MEDIA_VERIFIED:'1'}),DIRECT_FILE_LARGE_BYTES);assert.equal(checkDirectFile(file,DIRECT_FILE_LARGE_BYTES).ok,true);assert.equal(checkDirectFile({...file,sizeBytes:17*MB},DIRECT_FILE_LARGE_BYTES).ok,false);});
