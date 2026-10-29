import assert from 'node:assert/strict';
import test from 'node:test';

import { planIncludesAi, planIncludesMessaging } from '../lib/billing/subscription-rules';

test('WhatsApp e Instagram manuais: a partir do Pro', () => {
  for (const slug of ['pro', 'business', 'premium', 'premium-pro', 'PRO']) assert.equal(planIncludesMessaging(slug), true, slug);
  for (const slug of ['free', 'starter', 'growth', '', null, undefined, 'pro-x']) assert.equal(planIncludesMessaging(slug), false, String(slug));
});

test('IA: só no Premium', () => {
  assert.equal(planIncludesAi('premium'), true);
  assert.equal(planIncludesAi('pro'), false);
  assert.equal(planIncludesAi('business'), false);
});
