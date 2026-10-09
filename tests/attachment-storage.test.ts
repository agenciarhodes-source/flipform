import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAttachmentObjectKey,
  createAttachmentDownloadUrl,
  createAttachmentUploadUrl,
  deleteAttachmentObject,
  presignS3Url,
  readAttachmentObject,
  resolveAttachmentStorage,
} from '../lib/storage/attachment-storage';

const config = {
  accountId: '0123456789abcdef0123456789abcdef',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  bucket: 'flipform-anexos',
};

test('assinatura confere com o exemplo publicado pela AWS para URL pré-assinada', () => {
  const url = presignS3Url({
    method: 'GET',
    host: 'examplebucket.s3.amazonaws.com',
    path: '/test.txt',
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: 'us-east-1',
    expiresSeconds: 86_400,
    now: new Date('2013-05-24T00:00:00.000Z'),
  });
  assert.match(url, /X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404$/);
  assert.match(url, /X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request/);
});

test('link de envio fica preso ao tipo e ao tamanho exatos do arquivo', () => {
  const url = createAttachmentUploadUrl(config, {
    key: 'tenants/t1/conversations/c1/a1',
    contentType: 'image/png',
    contentLength: 1024,
    now: new Date('2026-10-10T12:00:00.000Z'),
  });
  assert.equal(url, 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/flipform-anexos/tenants/t1/conversations/c1/a1'
    + '?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20261010%2Fauto%2Fs3%2Faws4_request'
    + '&X-Amz-Date=20261010T120000Z&X-Amz-Expires=300&X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost'
    + '&X-Amz-Signature=a3eb6c2a0a594835375899524a9655dd50040cbc7d22eabdca7f113a3818e855');
  const other = createAttachmentUploadUrl(config, {
    key: 'tenants/t1/conversations/c1/a1', contentType: 'image/png', contentLength: 2048,
    now: new Date('2026-10-10T12:00:00.000Z'),
  });
  assert.notEqual(url, other);
});

test('link de download vale um minuto e nunca expõe a chave secreta', () => {
  const url = createAttachmentDownloadUrl(config, { key: 'tenants/t1/conversations/c1/a1' });
  assert.match(url, /X-Amz-Expires=60&/);
  assert.equal(url.includes(config.secretAccessKey), false);
  assert.equal(url.includes(encodeURIComponent(config.secretAccessKey)), false);
});

test('chave do objeto é montada pelo servidor e não aceita caracteres de caminho', () => {
  assert.equal(
    buildAttachmentObjectKey({ tenantId: '../t1', conversationId: 'c/1', attachmentId: 'a?1' }),
    'tenants/t1/conversations/c1/a1',
  );
});

test('armazenamento fica desligado sem configuração e recusa configuração inválida', () => {
  assert.deepEqual(resolveAttachmentStorage({} as NodeJS.ProcessEnv), { ready: false, reason: 'not_configured' });
  const invalid = resolveAttachmentStorage({ R2_ACCOUNT_ID: 'x', R2_ACCESS_KEY_ID: 'y', R2_SECRET_ACCESS_KEY: 'z',
    R2_ATTACHMENTS_BUCKET: 'Bucket Com Espaço' } as unknown as NodeJS.ProcessEnv);
  assert.deepEqual(invalid, { ready: false, reason: 'invalid_configuration' });
  const ready = resolveAttachmentStorage({ R2_ACCOUNT_ID: config.accountId, R2_ACCESS_KEY_ID: config.accessKeyId,
    R2_SECRET_ACCESS_KEY: config.secretAccessKey, R2_ATTACHMENTS_BUCKET: config.bucket } as unknown as NodeJS.ProcessEnv);
  assert.equal(ready.ready, true);
});

test('leitura recusa arquivo maior que o limite e exclusão trata arquivo ausente como apagado', async () => {
  const big = (async () => new Response(new Uint8Array(10), { status: 200 })) as typeof fetch;
  assert.equal(await readAttachmentObject(config, { key: 'k', maxBytes: 5, fetchImpl: big }), null);
  const ok = (async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })) as typeof fetch;
  assert.deepEqual(await readAttachmentObject(config, { key: 'k', maxBytes: 5, fetchImpl: ok }), new Uint8Array([1, 2, 3]));
  const missing = (async () => new Response(null, { status: 404 })) as typeof fetch;
  assert.equal(await readAttachmentObject(config, { key: 'k', maxBytes: 5, fetchImpl: missing }), null);
  assert.equal(await deleteAttachmentObject(config, { key: 'k', fetchImpl: missing }), true);
  const denied = (async () => new Response(null, { status: 403 })) as typeof fetch;
  await assert.rejects(deleteAttachmentObject(config, { key: 'k', fetchImpl: denied }));
});
