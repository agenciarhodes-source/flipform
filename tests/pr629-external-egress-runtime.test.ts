import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPr629NoExternalEgress, isPr629ExternalEgressBlocked } from '../lib/qa/pr629-external-egress';
import { sendGoogleConversionIngest } from '../lib/tracking/google-data-manager';

test('PR629 brake only applies with explicit opt-in in Vercel preview', () => {
  const check = (flag: string | undefined, target: string | undefined) =>
    isPr629ExternalEgressBlocked({ PR629_BLOCK_EXTERNAL_EGRESS: flag, VERCEL_ENV: target });
  assert.equal(check(undefined, 'preview'), false);
  assert.equal(check('false', 'preview'), false);
  assert.equal(check('TRUE', 'preview'), false);
  assert.equal(check('true', undefined), false);
  assert.equal(check('true', 'development'), false);
  assert.equal(check('true', 'production'), false);
  assert.equal(check('true', 'preview'), true);
});

test('PR629 brake throws only symbolic error and does not leak provider payload', () => {
  const originalFlag = process.env.PR629_BLOCK_EXTERNAL_EGRESS;
  const originalTarget = process.env.VERCEL_ENV;
  try {
    process.env.PR629_BLOCK_EXTERNAL_EGRESS = 'true';
    process.env.VERCEL_ENV = 'preview';
    assert.throws(
      () => assertPr629NoExternalEgress('private-test-token-and-provider'),
      (err: unknown) => err instanceof Error
        && err.message === 'PR629_EXTERNAL_EGRESS_BLOCKED'
        && !err.message.includes('private-test-token'),
    );
    process.env.VERCEL_ENV = 'production';
    assert.doesNotThrow(() => assertPr629NoExternalEgress('fake-test-provider'));
  } finally {
    if (originalFlag === undefined) delete process.env.PR629_BLOCK_EXTERNAL_EGRESS;
    else process.env.PR629_BLOCK_EXTERNAL_EGRESS = originalFlag;
    if (originalTarget === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalTarget;
  }
});

test('Google conversion transport cannot invoke injected HTTP client when PR629 QA brake is active', async () => {
  const originalFlag = process.env.PR629_BLOCK_EXTERNAL_EGRESS;
  const originalTarget = process.env.VERCEL_ENV;
  try {
    process.env.PR629_BLOCK_EXTERNAL_EGRESS = 'true';
    process.env.VERCEL_ENV = 'preview';
    let outboundCalls = 0;
    const response = await sendGoogleConversionIngest(
      { validateOnly: true, conversions: [] },
      'fake-never-send',
      { fetchImpl: async () => {
        outboundCalls += 1;
        throw new Error('network call should never happen');
      } },
    );
    assert.equal(outboundCalls, 0);
    assert.deepEqual(response, { outcome: 'retry', code: 'NETWORK_ERROR' });
  } finally {
    if (originalFlag === undefined) delete process.env.PR629_BLOCK_EXTERNAL_EGRESS;
    else process.env.PR629_BLOCK_EXTERNAL_EGRESS = originalFlag;
    if (originalTarget === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalTarget;
  }
});
