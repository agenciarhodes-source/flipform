import assert from 'node:assert/strict';
import { buildWhatsAppUrl, normalizeWhatsAppPhone } from '../lib/whatsapp-link';

for (const phone of [
  '5598970169380',
  '+55 (98) 97016-9380',
  '(98) 97016-9380',
  '98 97016-9380',
  '098970169380',
  '00 55 98 97016-9380',
]) {
  assert.equal(normalizeWhatsAppPhone(phone), '5598970169380');
}

for (const phone of [null, '', 'texto sem números', '987', '5512345678901234']) {
  assert.equal(normalizeWhatsAppPhone(phone), null);
}

assert.equal(
  buildWhatsAppUrl('(98) 97016-9380'),
  'https://wa.me/5598970169380',
);
assert.match(buildWhatsAppUrl('+55 (98) 97016-9380')!, /^https:\/\/wa\.me\/\d+$/);

console.log('whatsapp-link tests passed');
