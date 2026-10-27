import assert from 'node:assert/strict';
import test from 'node:test';

import { getClientIp, memoryRateLimit, rateLimitKeyHash } from '../lib/rate-limit';

const request = (headers: Record<string, string>) => new Request('https://app.flipform.com.br/api/auth/login', { headers });

test('o IP vem do que a Vercel informa, não de um cabeçalho que o cliente inventa', () => {
  assert.equal(getClientIp(request({ 'cf-connecting-ip': '6.6.6.6', 'x-real-ip': '200.1.1.1' })), '200.1.1.1');
  assert.equal(getClientIp(request({ 'x-vercel-forwarded-for': '200.2.2.2', 'x-forwarded-for': '9.9.9.9' })), '200.2.2.2');
  assert.equal(getClientIp(request({ 'x-forwarded-for': '200.3.3.3, 10.0.0.1' })), '200.3.3.3');
  assert.equal(getClientIp(request({})), 'unknown');
});

test('Cloudflare só vale quando ligado de propósito', () => {
  process.env.TRUST_CLOUDFLARE_IP = '1';
  try {
    assert.equal(getClientIp(request({ 'cf-connecting-ip': '200.4.4.4', 'x-real-ip': '10.0.0.1' })), '200.4.4.4');
  } finally {
    delete process.env.TRUST_CLOUDFLARE_IP;
  }
});

test('o limite em memória (reserva) conta e bloqueia', () => {
  const key = `test:${Math.random()}`;
  const results = Array.from({ length: 4 }, () => memoryRateLimit({ key, limit: 3, windowMs: 60_000 }));
  assert.deepEqual(results.map((result) => result.allowed), [true, true, true, false]);
  assert.equal(results[3].remaining, 0);
});

test('a chave vai para o banco só como hash, sem e-mail nem IP', () => {
  const hash = rateLimitKeyHash('login:email:maria@exemplo.com');
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.ok(!hash.includes('maria'));
});
