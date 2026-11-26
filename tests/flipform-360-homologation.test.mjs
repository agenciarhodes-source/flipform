import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
const read = path => readFileSync(new URL('../'+path, import.meta.url),'utf8');
const pkg = JSON.parse(read('package.json'));
const ci = read('.github/workflows/ci.yml');
const security = read('.github/workflows/security.yml');
const ts = ["tests/universal-connectors-sandbox.test.ts","tests/universal-sync-fixture-policy.test.ts","tests/flip-ads-read.test.ts","tests/flip-ads-campaign-planner.test.ts"];
const js = ["tests/flip-ads-additional-reporting.test.mjs","tests/google-organic-reporting.test.mjs","tests/enterprise-data.test.mjs","tests/flip-intelligence-executive-snapshot.test.mjs","tests/flip-intelligence-executive-advice.test.mjs","tests/executive-whatsapp.test.mjs","tests/executive-proactivity.test.mjs","tests/flip-intelligence-commercial-readiness.test.mjs"];
test('PR A-M suites explicitly wired and present',()=>{
 for(const [script,files] of [['test:360:ts',ts],['test:360:node',js]]) {
  assert.ok(ci.includes('npm run '+script));
  for(const file of files) {
   assert.ok(existsSync(new URL('../'+file, import.meta.url)),file);
   assert.ok(pkg.scripts[script].split(' ').includes(file),file);
  }
 }
 for(const file of ['tests/universal-connectors-contracts.test.ts','tests/universal-connectors-vault.test.ts','tests/universal-connectors-registry.integration.test.ts','tests/universal-sync-fixture.integration.test.ts'])assert.ok(ci.includes(file),file);
 assert.ok(ci.includes('python -m pytest tests -q'));
});
test('isolated schema rehearsal and non-skipped integration',()=>{
 assert.ok(ci.includes('UNIVERSAL_SYNC_FIXTURE_ENABLED: "true"'));
 assert.ok(ci.includes("grep -Eq '^# skipped 0$'"));
 assert.ok(ci.includes('createdb flipform_360_sql'));
 for(const file of ['tests/sql/flipform-360-predecessor.sql','tests/sql/flipform-360-constraints.sql','prisma/migrations/20261124210000_universal_connect_foundation/migration.sql','prisma/migrations/20261126001000_universal_sync_fixture/migration.sql','prisma/migrations/20261126040000_flip_ads_campaign_drafts/migration.sql']){
  assert.ok(ci.includes(file),file);assert.ok(existsSync(new URL('../'+file,import.meta.url)),file);
 }
 assert.doesNotMatch(ci,/secrets\.(?:DATABASE_URL|DIRECT_URL)/);
 assert.ok(ci.includes('flipform_ci --require-direct'));
});
test('PR-N scans accumulated history and code, not only branch diff',()=>{
 assert.ok(security.includes('refs/heads/feat/flipform-360-pr-n-homologation'));
 assert.ok(security.includes('Whole history'));
 assert.ok(security.includes('--severity ERROR --error'));
 assert.ok(ci.includes("github.head_ref != 'feat/flipform-360-pr-n-homologation'"));
});
