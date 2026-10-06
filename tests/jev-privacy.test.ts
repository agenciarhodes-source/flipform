import assert from 'node:assert/strict';
import test from 'node:test';
import { jevSubjectReference, redactJevText, sanitizeJevPayload } from '../lib/flip-ai/jev-privacy';

test('JEV redaction removes direct, financial and medical identifiers but keeps qualification facts', () => {
  const input = 'Meu nome é Maria da Silva, CPF 123.456.789-00, WhatsApp (86) 99999-1111, maria@email.com, agência 1234 conta 123456-7, prontuário 987654. Sou trabalhadora rural e tenho autismo.';
  const safe = redactJevText(input);
  for (const secret of ['Maria da Silva', '123.456.789-00', '99999-1111', 'maria@email.com', '123456-7', '987654']) assert.ok(!safe.includes(secret), secret);
  assert.match(safe, /trabalhadora rural/);
  assert.match(safe, /autismo/);
});

test('provider boundary recursively redacts new fields and credentials', () => {
  const safe = sanitizeJevPayload({state: {name: 'Maria', nested: {cpf: '12345678900', note: 'E-mail maria@email.com'}}, apiKey: 'key-do-not-send'});
  const serialized = JSON.stringify(safe);
  for (const secret of ['Maria', '12345678900', 'maria@email.com', 'key-do-not-send']) assert.ok(!serialized.includes(secret));
});

test('provider boundary safely truncates deep, circular and oversized structures', () => {
  const circular: Record<string, unknown> = {safe: 'trabalhadora rural'};
  circular.self = circular;
  let deep: Record<string, unknown> = {value: 'fim'};
  for (let index = 0; index < 30; index += 1) deep = {nested: deep};
  const safe = sanitizeJevPayload({
    circular,
    deep,
    hugeArray: Array.from({length: 1_000}, (_, index) => index),
  }) as {circular: {self: string}; deep: unknown; hugeArray: number[]};
  assert.equal(safe.circular.self, '[estrutura omitida]');
  assert.equal(safe.hugeArray.length, 100);
  assert.doesNotThrow(() => JSON.stringify(safe));
  assert.match(JSON.stringify(safe.deep), /estrutura omitida/);
});

test('provider boundary converts values that JSON cannot safely serialize', () => {
  const safe = sanitizeJevPayload({big: 1n, infinite: Number.POSITIVE_INFINITY, fn: () => 'secret'});
  assert.deepEqual(safe, {
    big: '[estrutura omitida]',
    infinite: null,
    fn: '[estrutura omitida]',
  });
});

test('subject reference is stable inside one tenant and opaque across tenants', () => {
  const first = jevSubjectReference('tenant-a', 'conversation-a');
  assert.equal(first, jevSubjectReference('tenant-a', 'conversation-a'));
  assert.notEqual(first, jevSubjectReference('tenant-b', 'conversation-a'));
  assert.ok(!first.includes('tenant-a') && !first.includes('conversation-a'));
});
