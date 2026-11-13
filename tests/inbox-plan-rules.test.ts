import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inboxPlanAllowsPath, inboxPlanBlocksPermission, isInboxOnlyPlan } from '../lib/billing/inbox-plan-rules';
import { planIncludesAi, planIncludesMessaging } from '../lib/billing/subscription-rules';
import { PLAN_CATALOG_SPECIAL } from '../lib/billing/plan-catalog';

test('the Plano Inbox has the attendance and no AI', () => {
  assert.equal(isInboxOnlyPlan('inbox'), true);
  assert.equal(isInboxOnlyPlan('premium'), false);
  assert.equal(isInboxOnlyPlan(null), false);
  assert.equal(planIncludesMessaging('inbox'), true);
  assert.equal(planIncludesAi('inbox'), false);
});

test('only the attendance screens open', () => {
  for (const path of ['/inbox', '/inbox?c=1', '/integrations', '/users', '/billing', '/billing/blocked', '/account', '/group/leads']) {
    assert.equal(inboxPlanAllowsPath(path), true, path);
  }
  for (const path of ['/dashboard', '/leads', '/kanban', '/forms', '/reports', '/direct', '/whatsapp-ai', '/settings', '/inboxes']) {
    assert.equal(inboxPlanAllowsPath(path), false, path);
  }
});

test('other modules are refused, what the Inbox reads is not', () => {
  for (const permission of ['FORMS_EDIT', 'PIPELINES_CREATE', 'REPORTS_VIEW_ALL', 'KANBAN_MOVE_ALL', 'FLIP_AI_MANAGE', 'DOMAINS_MANAGE', 'DASHBOARD_VIEW_ALL']) {
    assert.equal(inboxPlanBlocksPermission(permission), true, permission);
  }
  for (const permission of ['INBOX_VIEW', 'INBOX_MANAGE', 'LEADS_VIEW', 'LEADS_CONTACT_WHATSAPP', 'INTEGRATIONS_EDIT', 'USERS_INVITE', 'BILLING_VIEW', 'PIPELINES_VIEW', 'DASHBOARD_FILTER_BY_ASSIGNEE', 'TASKS_VIEW']) {
    assert.equal(inboxPlanBlocksPermission(permission), false, permission);
  }
});

test('the migration creates exactly the catalog plan and changes nothing else', () => {
  const sql = readFileSync(join(process.cwd(), 'prisma', 'migrations', '20261121120000_inbox_plan', 'migration.sql'), 'utf8');
  const [plan] = PLAN_CATALOG_SPECIAL;
  assert.equal(plan.slug, 'inbox');
  assert.equal(plan.price, 397);
  assert.ok(sql.includes(`'${plan.name}', '${plan.slug}', '${plan.description}', ${plan.price.toFixed(2)}, 'monthly'`));
  assert.ok(sql.includes('ON CONFLICT ("slug") DO NOTHING'));
  assert.ok(!/DELETE|DROP|TRUNCATE|UPDATE SET/i.test(sql));
});
