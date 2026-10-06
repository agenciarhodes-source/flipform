import assert from 'node:assert/strict';
import test from 'node:test';
import { safeJevErrorCode } from '../lib/flip-ai/jev-errors';

test('JEV error policy preserves only allowlisted provider diagnostics', () => {
  assert.equal(safeJevErrorCode(new Error('JEV_HTTP_429')), 'JEV_HTTP_429');
  assert.equal(safeJevErrorCode(new Error('JEV_TRANSPORT_FAILED')), 'JEV_TRANSPORT_FAILED');
  assert.equal(safeJevErrorCode(new Error('JEV_REQUEST_TOO_LARGE')), 'JEV_REQUEST_TOO_LARGE');
  assert.equal(safeJevErrorCode(new Error('JEV_RESPONSE_CONTENT_TYPE_INVALID')), 'JEV_RESPONSE_CONTENT_TYPE_INVALID');
  assert.equal(safeJevErrorCode(new Error('JEV_RESPONSE_TOO_LARGE')), 'JEV_RESPONSE_TOO_LARGE');
  assert.equal(safeJevErrorCode(new Error('JEV_PROFILE_RESPONSE_INVALID')), 'JEV_PROFILE_RESPONSE_INVALID');
});

test('JEV error policy replaces unexpected messages that could contain secrets or customer data', () => {
  const unsafe = new Error('database failed for maria@email.com using sk-live-secret');
  assert.equal(safeJevErrorCode(unsafe), 'JEV_RUNTIME_FAILED');
  assert.equal(safeJevErrorCode(unsafe, 'JEV_READINESS_FAILED'), 'JEV_READINESS_FAILED');
  assert.equal(safeJevErrorCode('CPF 123.456.789-00'), 'JEV_RUNTIME_FAILED');
});

test('JEV error policy rejects malformed or out-of-range HTTP codes', () => {
  assert.equal(safeJevErrorCode(new Error('JEV_HTTP_42')), 'JEV_RUNTIME_FAILED');
  assert.equal(safeJevErrorCode(new Error('JEV_HTTP_999')), 'JEV_RUNTIME_FAILED');
  assert.equal(safeJevErrorCode(new Error('JEV_HTTP_401 secret')), 'JEV_RUNTIME_FAILED');
});
