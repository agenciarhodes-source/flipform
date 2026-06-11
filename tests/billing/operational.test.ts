import assert from 'node:assert/strict';
import { calculateGracePeriodEndsAt, evaluateBillingAccess } from '../../lib/billing-access';
import { scanSubscriptionsForSuspension } from '../../lib/billing-suspension';
import { isCronRequestAuthorized } from '../../lib/cron-auth';

async function testPaymentOverdueGracePeriod() {
  const dueDate = new Date('2026-06-01T00:00:00.000Z');
  assert.equal(calculateGracePeriodEndsAt(dueDate).toISOString(), '2026-06-06T00:00:00.000Z');

  const access = evaluateBillingAccess({ tenantStatus: 'past_due', subscriptionStatus: 'past_due', gracePeriodEndsAt: '2026-06-06T00:00:00.000Z', now: new Date('2026-06-05T12:00:00.000Z') });
  assert.equal(access.allowAccess, true);
  assert.equal(access.showPastDueWarning, true);
  assert.equal(access.reason, 'past_due_grace');
}

async function testPastDueExpiredSuspends() {
  const subscriptionRows = [
    { id: 'sub_expired', tenantId: 'tenant_1', status: 'past_due', gracePeriodEndsAt: new Date('2026-06-06T00:00:00.000Z'), tenant: { status: 'past_due', name: 'Tenant 1' } },
  ];
  const calls: any[] = [];
  const prismaClient: any = {
    subscription: {
      findMany: async () => subscriptionRows,
      updateMany: async (args: any) => {
        calls.push(['subscription.updateMany', args]);
        return { count: 1 };
      },
    },
    tenant: {
      updateMany: async (args: any) => {
        calls.push(['tenant.updateMany', args]);
        return { count: 1 };
      },
    },
  };

  const audits: any[] = [];
  const result = await scanSubscriptionsForSuspension({
    now: new Date('2026-06-07T00:00:00.000Z'),
    prismaClient,
    logAuditFn: async (entry: any) => {
      audits.push(entry);
    },
  });

  assert.equal(result.suspended, 1);
  assert.equal(calls[0][1].data.status, 'suspended');
  assert.equal(calls[1][1].data.status, 'suspended');
  assert.equal(audits[0].action, 'billing.subscription_suspended');
}

async function testCourtesyNeverBlocks() {
  const access = evaluateBillingAccess({ tenantStatus: 'suspended', subscriptionStatus: 'courtesy', now: new Date('2026-06-07T00:00:00.000Z') });
  assert.equal(access.allowAccess, true);
  assert.equal(access.reason, 'courtesy');
}

async function testPaymentReceivedReactivatesShape() {
  const recovered = evaluateBillingAccess({ tenantStatus: 'active', subscriptionStatus: 'active', gracePeriodEndsAt: null });
  assert.equal(recovered.allowAccess, true);
  assert.equal(recovered.reason, 'active');
}

async function testSuspendedBlocks() {
  const access = evaluateBillingAccess({ tenantStatus: 'suspended', subscriptionStatus: 'suspended' });
  assert.equal(access.allowAccess, false);
  assert.equal(access.reason, 'suspended');
}

async function testSuperAdminNeverBlocks() {
  const access = evaluateBillingAccess({ tenantStatus: 'suspended', subscriptionStatus: 'suspended', isSuperAdmin: true });
  assert.equal(access.allowAccess, true);
  assert.equal(access.reason, 'super_admin');
}

async function testCronSecretRequired() {
  const previous = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  assert.equal(isCronRequestAuthorized(new Request('https://flipform.test/api/cron/billing-suspension')), false);

  process.env.CRON_SECRET = 'secret';
  assert.equal(isCronRequestAuthorized(new Request('https://flipform.test/api/cron/billing-suspension')), false);
  assert.equal(isCronRequestAuthorized(new Request('https://flipform.test/api/cron/billing-suspension', { headers: { authorization: 'Bearer secret' } })), true);
  assert.equal(isCronRequestAuthorized(new Request('https://flipform.test/api/cron/billing-suspension', { headers: { 'x-cron-secret': 'secret' } })), true);

  if (previous === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previous;
}

async function main() {
  await testPaymentOverdueGracePeriod();
  await testPastDueExpiredSuspends();
  await testCourtesyNeverBlocks();
  await testPaymentReceivedReactivatesShape();
  await testSuspendedBlocks();
  await testSuperAdminNeverBlocks();
  await testCronSecretRequired();

  console.log('billing operational tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
