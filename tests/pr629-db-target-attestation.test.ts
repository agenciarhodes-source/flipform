import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPr629DbAttestationAllowed,
  pr629DbTargetsMatchApprovedQa,
  PR629_QA_DB_HOST,
} from '../lib/qa/pr629-db-target-attestation';

const valid = {
  VERCEL_ENV: 'preview',
  VERCEL_GIT_COMMIT_REF: 'security/api-v1-homologation-20261121',
  PR629_DB_ATTESTATION_ENABLED: 'true',
  PR629_BLOCK_EXTERNAL_EGRESS: 'true',
  FLIPFORM_API_V1_ENABLED: 'false',
  EMAIL_PROVIDER: 'none',
  MAINTENANCE_GATE: 'disabled',
  DATABASE_URL: `postgresql://fake:fake@${PR629_QA_DB_HOST.replace('.c-16.', '-pooler.c-16.')}:5432/flipform_staging?schema=public`,
  DIRECT_URL: `postgresql://fake:fake@${PR629_QA_DB_HOST}:5432/flipform_staging?schema=public`,
};

test('QA DB attestation requires exact branch, preview, API OFF and guards', () => {
  assert.equal(isPr629DbAttestationAllowed(valid), true);
  for (const [key, value] of Object.entries({
    VERCEL_ENV: 'production',
    VERCEL_GIT_COMMIT_REF: 'main',
    PR629_DB_ATTESTATION_ENABLED: 'false',
    PR629_BLOCK_EXTERNAL_EGRESS: 'false',
    FLIPFORM_API_V1_ENABLED: 'true',
    EMAIL_PROVIDER: 'resend',
    MAINTENANCE_GATE: 'enabled',
  })) {
    assert.equal(isPr629DbAttestationAllowed({ ...valid, [key]: value }), false, key);
  }
});

test('both SQL URLs must target ONLY the isolated QA endpoint', () => {
  assert.equal(pr629DbTargetsMatchApprovedQa(valid), true);
  assert.equal(pr629DbTargetsMatchApprovedQa({ ...valid, DIRECT_URL: undefined }), false);
  assert.equal(pr629DbTargetsMatchApprovedQa({ ...valid, DATABASE_URL: '' }), false);
  assert.equal(pr629DbTargetsMatchApprovedQa({ ...valid, DATABASE_URL: valid.DATABASE_URL.replace('flipform_staging', 'leadflow') }), false);
  assert.equal(pr629DbTargetsMatchApprovedQa({ ...valid, DATABASE_URL: 'https://example.com/flipform_staging' }), false);
  assert.equal(pr629DbTargetsMatchApprovedQa({ ...valid, DIRECT_URL: valid.DATABASE_URL }), false);
  assert.equal(pr629DbTargetsMatchApprovedQa({ ...valid, DIRECT_URL: 'postgresql://u:p@ep-divine-wave-bc5voxq2.c-16.us-east-1.aws.neon.tech/flipform_staging' }), false);
  assert.equal(pr629DbTargetsMatchApprovedQa({ ...valid, DIRECT_URL: 'postgresql://u:p@evil.example.com/flipform_staging' }), false);
});
