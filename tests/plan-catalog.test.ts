import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PLAN_CATALOG, PLAN_CATALOG_UNSOLD, type CatalogPlan } from '../lib/billing/plan-catalog';

const migration = readFileSync(join(process.cwd(), 'prisma', 'migrations', '20261027120000_plan_catalog_october_2026', 'migration.sql'), 'utf8');
const FEATURES = ['canUseReports', 'canExportCsv', 'canUseCustomBranding', 'canUseMetaPixel', 'canUseWebhooks', 'canUseTasks'] as const;
const LIMITS = ['maxUsers', 'maxForms', 'maxPipelines', 'maxLeadsPerMonth'] as const;
const atLeast = (value: number, previous: number) => value === 0 || (previous !== 0 && value >= previous);

test('preços aprovados em outubro de 2026', () => {
  assert.deepEqual(PLAN_CATALOG.map((plan) => [plan.slug, plan.price]), [
    ['starter', 49], ['growth', 197], ['pro', 349], ['business', 599], ['premium', 997],
  ]);
});

test('cada plano custa mais e tem tudo o que o anterior tem', () => {
  for (let index = 1; index < PLAN_CATALOG.length; index += 1) {
    const previous = PLAN_CATALOG[index - 1];
    const plan = PLAN_CATALOG[index];
    assert.ok(plan.price > previous.price, `${plan.slug} deve custar mais que ${previous.slug}`);
    for (const feature of FEATURES) {
      assert.ok(!previous[feature] || plan[feature], `${plan.slug} perdeu ${feature} em relação a ${previous.slug}`);
    }
    for (const limit of LIMITS) {
      assert.ok(atLeast(plan[limit], previous[limit]), `${plan.slug} tem ${limit} menor que ${previous.slug}`);
    }
  }
});

test('a migração aplica exatamente o catálogo', () => {
  const row = (plan: CatalogPlan) => [
    `'${plan.name}'`, `'${plan.slug}'`, `'${plan.description}'`, plan.price.toFixed(2), "'monthly'",
    plan.maxUsers, plan.maxForms, plan.maxPipelines, plan.maxLeadsPerMonth,
    ...FEATURES.map((feature) => (plan[feature] ? 'TRUE' : 'FALSE')), plan.isActive ? 'TRUE' : 'FALSE',
  ].join(', ');
  for (const plan of [...PLAN_CATALOG, ...PLAN_CATALOG_UNSOLD]) {
    assert.ok(migration.includes(`(gen_random_uuid()::text, ${row(plan)}, NOW(), NOW())`), `migração sem o plano ${plan.slug} igual ao catálogo`);
  }
  assert.ok(migration.includes('ON CONFLICT ("slug") DO UPDATE SET'));
  assert.ok(!/DELETE|DROP|TRUNCATE/i.test(migration));
});
