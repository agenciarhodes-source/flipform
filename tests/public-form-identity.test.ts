import assert from 'node:assert/strict';
import test from 'node:test';
import { selectUniquePublicForm } from '../lib/forms/public-form-identity-policy';
import { getVerifiedLegacyFormAlias } from '../lib/forms/verified-legacy-form-aliases';
import { buildPublicFormUrlState } from '../lib/forms/public-form-url';

const a = { id: 'a-id', tenantId: 'tenant-a', slug: 'maternidade' };
const b = { id: 'b-id', tenantId: 'tenant-b', slug: 'maternidade' };

test('unique scoped form is selected without falling back to another tenant', () => {
  assert.deepEqual(selectUniquePublicForm([a]), a);
  assert.deepEqual(selectUniquePublicForm([b]), b);
});

test('identical slug across tenants fails closed without arbitrary selection', () => {
  assert.equal(selectUniquePublicForm([a, b]), null);
  assert.equal(selectUniquePublicForm([b, a]), null);
});

test('missing and unexpectedly duplicated candidates fail closed', () => {
  assert.equal(selectUniquePublicForm([]), null);
  assert.equal(selectUniquePublicForm([a, a]), null);
});

const tenantA = '11111111-1111-4111-8111-111111111111';
const formA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const tenantB = '22222222-2222-4222-8222-222222222222';

function verified(slug = 'maternidade', tenantId = tenantA, formId = formA, evidenceRef = 'PR00-APPROVAL-SYNTHETIC') {
  return { slug, tenantId, formId, evidenceRef };
}

test('legacy alias manifest is opt-in and binds an audited slug to tenant and immutable form ID', () => {
  assert.equal(getVerifiedLegacyFormAlias('maternidade', undefined), null);
  assert.equal(getVerifiedLegacyFormAlias('maternidade', ''), null);
  assert.deepEqual(
    getVerifiedLegacyFormAlias('maternidade', JSON.stringify({ version: 1, verified: [verified()] })),
    { formId: formA, tenantId: tenantA },
  );
  assert.equal(getVerifiedLegacyFormAlias('outro', JSON.stringify({ version: 1, verified: [verified()] })), null);
});

test('invalid, missing-evidence, duplicated or oversized alias manifests deny every alias', () => {
  const invalid = [
    '{',
    '[]',
    JSON.stringify({ version: 2, verified: [verified()] }),
    JSON.stringify({ version: 1, verified: [verified(), verified('maternidade', tenantB)] }),
    JSON.stringify({ version: 1, verified: [verified('maternidade', tenantA, formA, '')] }),
    JSON.stringify({ version: 1, verified: [verified('maternidade', 'not-a-uuid')] }),
    JSON.stringify({ version: 1, verified: [verified('maternidade', tenantA, 'not-a-uuid')] }),
    JSON.stringify({ version: 1, verified: [verified('../other')] }),
    JSON.stringify({ version: 1, verified: Array.from({ length: 201 }, (_, i) => verified('slug-' + i)) }),
    'X'.repeat(32769),
  ];
  for (const input of invalid) {
    assert.equal(getVerifiedLegacyFormAlias('maternidade', input), null, input.slice(0, 40));
  }
});


test('public URL builder always generates immutable platform URL while preserving verified custom host', () => {
  const fallback = buildPublicFormUrlState({
    slug: 'maternidade', formId: formA, appDomain: 'app.flipform.com.br',
  });
  assert.equal(fallback.activeUrl, 'https://app.flipform.com.br/f/id/' + formA + '/maternidade');
  assert.equal(fallback.state, 'default');

  const pending = buildPublicFormUrlState({
    slug: 'maternidade', formId: formA, appDomain: 'app.flipform.com.br',
    primaryDomain: {
      domain: 'leads.example.invalid', status: 'active',
      verificationStatus: 'verified', sslStatus: 'pending',
    },
  });
  assert.equal(pending.activeUrl, fallback.activeUrl);

  const active = buildPublicFormUrlState({
    slug: 'maternidade', formId: formA, appDomain: 'app.flipform.com.br',
    primaryDomain: {
      domain: 'leads.example.invalid', status: 'active',
      verificationStatus: 'verified', sslStatus: 'active',
    },
  });
  assert.equal(active.activeUrl, 'https://leads.example.invalid/maternidade');
  assert.equal(active.state, 'custom_active');
});
