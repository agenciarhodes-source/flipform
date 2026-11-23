import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { GET as capabilities } from '../app/api/v1/capabilities/route';
import { createApiV1Integration, listApiV1Integrations,
  setApiV1IntegrationState, listApiV1Keys, belowApiV1KeyLimit,
} from '../lib/api-v1/integration-management';
import { issueApiV1Key, rotateApiV1Key, revokeApiV1Key } from '../lib/api-v1/credential-lifecycle';
import { isApiV1SameOriginMutation } from '../lib/api-v1/admin-http';
import { mayManageApiV1Credentials } from '../lib/api-v1/prisma-credential-repository';

function assertDisposableOnly(): void {
  if (process.env.CI !== 'true') throw new Error('PR01 closure test is CI only');
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['postgresql:', 'postgres:'].includes(url.protocol)
    || url.hostname !== '127.0.0.1' || url.port !== '5432'
    || url.pathname !== '/flipform_ci' || url.username !== 'postgres')
    throw new Error('PR01 closure test only accepts disposable local PostgreSQL');
}

test('PR01 same-origin management guard is deny-by-default', () => {
  const url = 'https://example.invalid/api/integrations/api-v1';
  const request = (origin: string, site: string) =>
    new Request(url, { method: 'POST', headers: {
      origin, 'sec-fetch-site': site,
    } });
  assert.equal(isApiV1SameOriginMutation(request('https://example.invalid', 'same-origin')), true);
  assert.equal(isApiV1SameOriginMutation(request('https://evil.invalid', 'cross-site')), false);
  assert.equal(isApiV1SameOriginMutation(request('https://example.invalid.evil.invalid', 'same-origin')), false);
  assert.equal(isApiV1SameOriginMutation(request('https://example.invalid', 'same-site')), false);
  assert.equal(isApiV1SameOriginMutation(new Request(url, { method: 'POST' })), false);
});

test('PR01 complete owner-M2M circuit: create disabled, activate, issue, read, rotate, revoke, isolate',
  { skip: process.env.CI !== 'true' },
  async () => {
    assertDisposableOnly();
    const db = new PrismaClient();
    const oldFlag = process.env.FLIPFORM_API_V1_ENABLED;
    process.env.FLIPFORM_API_V1_ENABLED = 'true'; // disposable CI runner only
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const tenants: string[] = [];
    let actorId = '';
    let ownPlanId = '';
    try {
      let plan = await db.plan.findUnique({ where: { slug: 'premium' } });
      if (!plan) {
        plan = await db.plan.create({ data: {
          slug: 'premium', name: 'Synthetic premium', price: 997, isActive: true,
        } });
        ownPlanId = plan.id;
      }
      const [a, b] = await Promise.all([
        db.tenant.create({ data: { name: 'PR01 Closure A', slug: 'closure-a-' + suffix } }),
        db.tenant.create({ data: { name: 'PR01 Closure B', slug: 'closure-b-' + suffix } }),
      ]);
      tenants.push(a.id, b.id);
      const actor = await db.user.create({ data: {
        name: 'Synthetic owner', email: 'closure-' + suffix + '@example.invalid',
        passwordHash: 'CI synthetic value only',
      } });
      actorId = actor.id;
      await db.tenantUser.createMany({ data: [
        { userId: actorId, tenantId: a.id, role: 'owner', status: 'active' },
        { userId: actorId, tenantId: b.id, role: 'viewer', status: 'active' },
      ] });
      await db.subscription.create({ data: {
        tenantId: a.id, planId: plan.id, status: 'active', provider: 'synthetic-pr01-closure',
      } });
      const ownerA = { userId: actorId, tenantId: a.id };
      const viewerB = { userId: actorId, tenantId: b.id };
      assert.equal(await mayManageApiV1Credentials(ownerA, a.id, db), true);
      assert.equal(await mayManageApiV1Credentials(viewerB, b.id, db), false);

      const integration = await createApiV1Integration(ownerA, 'Synthetic Finance Connector', db);
      assert.ok(integration);
      assert.equal(integration.status, 'disabled');
      assert.equal((await listApiV1Integrations(ownerA, db))?.length, 1);
      assert.equal(await listApiV1Integrations(viewerB, db), null);
      assert.equal(await setApiV1IntegrationState(viewerB, integration.id, 'active', db), null);
      assert.equal(await setApiV1IntegrationState(ownerA, integration.id, 'active', db) !== null, true);
      assert.equal(await belowApiV1KeyLimit(ownerA, integration.id, db), true);

      const issued = await issueApiV1Key(ownerA, {
        integrationId: integration.id, scopes: ['integrations.read'],
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      }, db);
      assert.ok(issued);
      assert.equal(issued.bearerToken.startsWith('ffv1.'), true);
      const metadata = await listApiV1Keys(ownerA, integration.id, db);
      assert.equal(metadata?.length, 1);
      assert.equal(JSON.stringify(metadata).includes(issued.bearerToken), false);
      assert.equal(JSON.stringify(metadata).includes('secretHashHex'), false);

      const call = (token: string | null) =>
        capabilities(new Request('https://example.invalid/api/v1/capabilities', {
          headers: token ? { authorization: 'Bearer ' + token } : {},
        }));
      assert.equal((await call(null)).status, 401);
      const success = await call(issued.bearerToken);
      assert.equal(success.status, 200);
      const result = await success.json() as Record<string, unknown>;
      assert.equal(result.tenantId, a.id);
      assert.equal(result.integrationId, integration.id);
      assert.equal(result.capability, 'integrations.read');
      assert.equal(JSON.stringify(result).includes('lead'), false);
      const altered = issued.bearerToken.slice(0, -1)
        + (issued.bearerToken.endsWith('a') ? 'b' : 'a');
      assert.equal((await call(altered)).status, 401);

      // Suspension is a reversible status update, not a hard delete. With
      // API rows present, credentials must stop working while audit survives.
      await db.tenant.update({ where: { id: a.id }, data: { status: 'suspended' } });
      assert.equal((await call(issued.bearerToken)).status, 403);
      assert.equal(await db.apiCredential.count({
        where: { tenantId: a.id, integrationId: integration.id },
      }), 1);
      assert.equal(await db.apiCredentialAudit.count({
        where: { tenantId: a.id, integrationId: integration.id },
      }), 1);
      await db.tenant.update({ where: { id: a.id }, data: { status: 'active' } });
      assert.equal((await call(issued.bearerToken)).status, 200);

      // A tenant with exactly one PR01 child (and no legacy children) must
      // reject physical deletion. This specifically tests the new FK, not a
      // pre-existing subscription/user FK that could mask a missing RESTRICT.
      const protectedTenant = await db.tenant.create({
        data: { name: 'PR01 restricted tenant', slug: 'restricted-' + suffix },
      });
      tenants.push(protectedTenant.id);
      const protectedIntegration = await db.apiIntegration.create({
        data: {
          tenantId: protectedTenant.id, displayName: 'FK-only synthetic child',
          status: 'disabled',
        },
      });
      await assert.rejects(
        db.tenant.delete({ where: { id: protectedTenant.id } }),
        (error: unknown) => (error as { code?: string })?.code === 'P2003',
      );
      assert.ok(await db.tenant.findUnique({ where: { id: protectedTenant.id } }));
      assert.ok(await db.apiIntegration.findUnique({ where: { id: protectedIntegration.id } }));

      const rotated = await rotateApiV1Key(ownerA, issued.credentialId, {
        integrationId: integration.id, expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      }, db);
      assert.ok(rotated);
      assert.equal((await call(issued.bearerToken)).status, 401);
      assert.equal((await call(rotated.bearerToken)).status, 200);
      assert.equal(await revokeApiV1Key(ownerA, rotated.credentialId, integration.id, db), true);
      assert.equal((await call(rotated.bearerToken)).status, 401);

      // The five-active-key limit must also hold under simultaneous requests.
      // Two old keys above were revoked, so four fresh sequential keys leave one slot.
      for (let i = 0; i < 4; i++) {
        const next = await issueApiV1Key(ownerA, {
          integrationId: integration.id, scopes: ['integrations.read'],
          expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        }, db);
        assert.ok(next);
      }
      const competingKeys = await Promise.all(Array.from({ length: 3 }, () => issueApiV1Key(ownerA, {
        integrationId: integration.id, scopes: ['integrations.read'],
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      }, db)));
      assert.equal(competingKeys.filter(Boolean).length, 1);
      assert.equal(await db.apiCredential.count({ where: {
        tenantId: a.id, integrationId: integration.id, revokedAt: null,
        expiresAt: { gt: new Date() },
      } }), 5);

      const other = await db.apiIntegration.create({ data: {
        tenantId: b.id, displayName: 'Synthetic B integration', status: 'active',
      } });
      assert.equal(await setApiV1IntegrationState(ownerA, other.id, 'disabled', db), null);
      assert.equal(await listApiV1Keys(ownerA, other.id, db), null);
      assert.equal(await issueApiV1Key(ownerA, {
        integrationId: other.id, scopes: ['integrations.read'],
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      }, db), null);
      const disabled = await setApiV1IntegrationState(ownerA, integration.id, 'disabled', db);
      assert.equal(disabled?.status, 'disabled');

      // A tenant cap needs the same protection; only one of three races may
      // occupy the fourth slot after two additional sequential integrations.
      for (let i = 0; i < 2; i++) {
        assert.ok(await createApiV1Integration(ownerA, `Supplementary ${i}`, db));
      }
      const competingIntegrations = await Promise.all(Array.from({ length: 3 }, (_, i) =>
        createApiV1Integration(ownerA, `Concurrent ${i}`, db)));
      assert.equal(competingIntegrations.filter(Boolean).length, 1);
      assert.equal((await listApiV1Integrations(ownerA, db))?.length, 4);

      process.env.FLIPFORM_API_V1_ENABLED = 'false';
      assert.equal((await call(rotated.bearerToken)).status, 404);
      assert.equal(await createApiV1Integration(ownerA, 'Must fail', db), null);
    } finally {
      if (tenants.length) {
        const where = { tenantId: { in: tenants } };
        await db.apiV1QuotaBucket.deleteMany({ where });
        await db.apiCredentialAudit.deleteMany({ where });
        await db.apiCredential.deleteMany({ where });
        await db.apiIntegration.deleteMany({ where });
        await db.auditLog.deleteMany({ where });
        await db.subscription.deleteMany({ where });
        await db.tenantUser.deleteMany({ where });
        await db.tenant.deleteMany({ where: { id: { in: tenants } } });
      }
      if (actorId) await db.user.delete({ where: { id: actorId } });
      if (ownPlanId) await db.plan.delete({ where: { id: ownPlanId } });
      if (oldFlag === undefined) delete process.env.FLIPFORM_API_V1_ENABLED;
      else process.env.FLIPFORM_API_V1_ENABLED = oldFlag;
      await db.$disconnect();
    }
  },
);
