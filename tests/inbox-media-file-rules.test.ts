import test from 'node:test';
import assert from 'node:assert/strict';
import { contentDisposition, extensionFor, mediaDownloadName } from '../lib/inbox/media-file-rules';

const sentAt = new Date('2026-11-11T18:09:00Z'); // 15:09 in Brasília

test('names: the customer file name, or the type with date and time and the right extension', () => {
  assert.equal(mediaDownloadName({ type: 'image', mimeType: 'image/jpeg', sentAt }), 'Foto 11-11-2026 15h09.jpg');
  assert.equal(mediaDownloadName({ type: 'audio', mimeType: 'audio/ogg; codecs=opus', sentAt }), 'Audio 11-11-2026 15h09.ogg');
  assert.equal(mediaDownloadName({ type: 'document', fileName: 'RG Maria.pdf', mimeType: 'application/pdf', sentAt }), 'RG Maria.pdf');
  assert.equal(mediaDownloadName({ type: 'document', fileName: 'Comprovante', mimeType: 'application/pdf', sentAt }), 'Comprovante.pdf');
  assert.equal(mediaDownloadName({ type: 'document', fileName: 'a/b:c.pdf', mimeType: 'application/pdf', sentAt }), 'a b c.pdf');
  assert.equal(extensionFor('application/octet-stream'), '');
});

test('disposition: plain ASCII name for older phones and the UTF-8 one', () => {
  assert.equal(
    contentDisposition('attachment', 'Certidão nº 1.pdf'),
    `attachment; filename="Certidao n_ 1.pdf"; filename*=UTF-8''Certid%C3%A3o%20n%C2%BA%201.pdf`,
  );
  assert.match(contentDisposition('inline', 'Foto.jpg'), /^inline; filename="Foto.jpg"/);
});
