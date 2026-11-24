import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import {
  PrismaApiV1CredentialRepository, mayManageApiV1Credentials,
} from '../lib/api-v1/prisma-credential-repository';
import { apiV1Entitled } from '../lib/api-v1/policy';
import { authorizeApiV1Request, digestApiV1Secret } from '../lib/api-v1/identity';
import { issueApiV1Key, rotateApiV1Key, revokeApiV1Key } from '../lib/api-v1/credential-lifecycle';

function assertDisposableCI(): void {
  if (process.env.CI !== 'true') throw new Error('PR01 integration suite is CI-only');
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['postgresql:', 'postgres:'].includes(url.protocol)
    || url.hostname !== '127.0.0.1' || url.port !== '5432'
    || url.pathname !== '/flipform_ci' || url.username !== 'postgres') {
    throw new Error('PR01 integration suite requires disposable local PostgreSQL');
  }
}

test('PR01 tenant-scoped credential FK, grants, expiry, roles and fail-closed quota (disposable DB)',
  { skip: process.env.CI !== 'true' },
  async () => {
    assertDisposableCI();
    const db = new PrismaClient();
    const oldFlag = process.env.FLIPFORM_API_V1_ENABLED;
    process.env.FLIPFORM_API_V1_ENABLED = 'true'; // CI process only; never Vercel
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    let tenantA = '';
    let tenantB = '';
    let actorId = '';
    let issuerId = '';
    let planId = '';
    let ownsPlan = false;
    try {
      let plan = await db.plan.findUnique({ where: { slug: 'premium' } });
      if (!plan) {
        plan = await db.plan.create({ data: {
          name: 'Premium', slug: 'premium', price: 997, isActive: true,
        } });
        ownsPlan = true;
      }
      planId = plan.id;
      const a = await db.tenant.create({ data: { name: 'Synthetic A', slug: 'pr01-a-' + suffix } });
      const b = await db.tenant.create({ data: { name: 'Synthetic B', slug: 'pr01-b-' + suffix } });
      tenantA = a.id;
      tenantB = b.id;
      await db.subscription.create({ data: {
        tenantId: tenantA, planId, status: 'active', provider: 'test-pr01',
      } });
      const actor = await db.user.create({ data: {
        name: 'Synthetic Owner', email: 'pr01-' + suffix + '@example.invalid',
        passwordHash: 'synthetic-not-a-password',
      } });
      actorId = actor.id;
      const issuer = await db.user.create({ data: {
        name: 'Synthetic Platform Approver', email: 'pr01-issuer-' + suffix + '@example.invalid',
        passwordHash: 'synthetic-not-a-password', globalRole: 'platform_admin',
      } });
      issuerId = issuer.id;
      await db.tenantUser.create({ data: {
        userId: actorId, tenantId: tenantA, role: 'owner', status: 'active',
      } });
      await db.tenantUser.create({ data: {
        userId: actorId, tenantId: tenantB, role: 'viewer', status: 'active',
      } });

      const integrationA = await db.apiIntegration.create({ data: {
        tenantId: tenantA, displayName: 'Synthetic A connector', status: 'active',
      } });
      const integrationB = await db.apiIntegration.create({ data: {
        tenantId: tenantB, displayName: 'Synthetic B connector', status: 'active',
      } });
      const secret = Buffer.alloc(32, 37); // deterministic, synthetic ONLY
      const credential = await db.apiCredential.create({ data: {
        tenantId: tenantA, integrationId: integrationA.id,
        secretHashHex: digestApiV1Secret(secret),
        scopes: ['integrations.read'],
        expiresAt: new Date('2029-01-01T00:00:00Z'),
      } });

      // Even code with write access cannot cross-link a credential into another tenant.
      await assert.rejects(db.apiCredential.create({ data: {
        tenantId: tenantA, integrationId: integrationB.id,
        secretHashHex: digestApiV1Secret(secret),
        scopes: ['integrations.read'],
      } }));

      const repo = new PrismaApiV1CredentialRepository(db);
      assert.equal((await repo.findCredential(credential.id))?.tenantId, tenantA);
      assert.equal(apiV1Entitled(tenantA, await repo.findTenantEntitlement(tenantA)), true);
      assert.equal(apiV1Entitled(tenantB, await repo.findTenantEntitlement(tenantB)), false);
      // A tenant owner alone is forbidden to manage keys: only a per-tenant
      // technical grant plus active MFA unlocks the developer credential gate.
      assert.equal(await mayManageApiV1Credentials({ userId: actorId, tenantId: tenantA }, tenantA, db), false);
      await db.developerTenantGrant.create({ data: {
        tenantId: tenantA, userId: actorId, grantedById: issuerId,
      } });
      assert.equal(await mayManageApiV1Credentials({ userId: actorId, tenantId: tenantA }, tenantA, db), false,
        'grant without MFA stays inert');
      await db.user.update({ where: { id: actorId }, data: { mfaEnabledAt: new Date() } });
      assert.equal(await mayManageApiV1Credentials({ userId: actorId, tenantId: tenantA }, tenantA, db), true);
      assert.equal(await mayManageApiV1Credentials({ userId: actorId, tenantId: tenantB }, tenantB, db), false);
      assert.equal(await mayManageApiV1Credentials({ userId: actorId, tenantId: tenantA }, tenantB, db), false);

      // An explicit, dated, approved grant covers only its own tenant.
      const grant = await db.tenantEntitlementGrant.create({ data: {
        tenantId: tenantB, feature: 'api_v1', enabled: true,
        reason: 'Synthetic CI exception', approvedBy: 'synthetic-reviewer',
        startsAt: new Date('2020-01-01T00:00:00Z'),
        expiresAt: new Date('2030-01-01T00:00:00Z'),
      } });
      assert.equal(apiV1Entitled(tenantB, await repo.findTenantEntitlement(tenantB)), true);
      await db.tenantEntitlementGrant.update({
        where: { id: grant.id }, data: { revokedAt: new Date() },
      });
      assert.equal(apiV1Entitled(tenantB, await repo.findTenantEntitlement(tenantB)), false);

      // A direct Premium subscription is valid; a group mirror is NOT automatically an API right.
      await db.subscription.create({ data: {
        tenantId: tenantB, planId, status: 'active', provider: 'business_group',
      } });
      assert.equal(apiV1Entitled(tenantB, await repo.findTenantEntitlement(tenantB)), false);

      // Phase 3: the server-only lifecycle requires an explicitly granted developer,
      // an eligible tenant, same-tenant integration and a future expiration.
      const developerA = { userId: actorId, tenantId: tenantA };
      const options = {
        integrationId: integrationA.id,
        expiresAt: new Date('2030-05-01T00:00:00Z'),
        scopes: ['integrations.read'] as const,
      };
      assert.equal(await issueApiV1Key(
        { userId: actorId, tenantId: tenantB },
        { ...options, integrationId: integrationB.id }, db,
      ), null, 'viewer in tenant B cannot issue');
      assert.equal(await issueApiV1Key(
        developerA, { ...options, integrationId: integrationB.id }, db,
      ), null, 'owner A cannot issue into integration B');
      const issued = await issueApiV1Key(developerA, options, db);
      assert.ok(issued && issued.bearerToken.startsWith('ffv1.'));
      const issuedRow = await db.apiCredential.findUnique({ where: { id: issued.credentialId } });
      assert.ok(issuedRow);
      assert.equal(issuedRow.tenantId, tenantA);
      assert.equal(issuedRow.secretHashHex.length, 64);
      assert.equal(issuedRow.secretHashHex.includes(issued.bearerToken), false);
      assert.equal(await db.apiCredentialAudit.count({ where: {
        tenantId: tenantA, credentialId: issued.credentialId, action: 'issued',
      } }), 1);

      const rotated = await rotateApiV1Key(
        developerA, issued.credentialId,
        { integrationId: integrationA.id, expiresAt: new Date('2031-01-01T00:00:00Z') }, db,
      );
      assert.ok(rotated && rotated.credentialId !== issued.credentialId);
      assert.equal((await db.apiCredential.findUnique({
        where: { id: issued.credentialId },
      }))?.revokedAt instanceof Date, true);
      assert.equal(await rotateApiV1Key(
        developerA, issued.credentialId,
        { integrationId: integrationA.id, expiresAt: new Date('2031-01-01T00:00:00Z') }, db,
      ), null, 'a revoked key cannot rotate twice');
      assert.equal(await revokeApiV1Key(developerA, rotated.credentialId, integrationA.id, db), true);
      assert.equal(await revokeApiV1Key(developerA, rotated.credentialId, integrationA.id, db), false);
      assert.equal(await db.apiCredentialAudit.count({
        where: { tenantId: tenantA, actorUserId: actorId },
      }), 4);
      assert.equal(await db.apiCredentialAudit.count({
        where: { tenantId: tenantB },
      }), 0, 'no cross-tenant audit');

      // Quotas are atomic across concurrent DB clients and deny on exceed.
      // This is a local, explicit synthetic test policy, NOT a production plan.
      const quotaRepo = new PrismaApiV1CredentialRepository(db, {
        limit: 2, windowMs: 60_000,
        now: () => new Date('2028-06-01T12:00:00Z'),
      });
      const quotaToken = 'Bearer ffv1.' + credential.id + '.' + secret.toString('base64url');
      const concurrent = await Promise.all(Array.from({ length: 10 }, () =>
        authorizeApiV1Request({
          authorizationHeader: quotaToken, scope: 'integrations.read',
          operation: 'GET /api/v1/diagnostic', now: new Date('2028-06-01T12:00:00Z'),
        }, quotaRepo)));
      assert.equal(concurrent.filter((result) => result.ok).length, 2);
      assert.equal(concurrent.filter((result) =>
        !result.ok && result.status === 429).length, 8);
      const quotaRows = await db.apiV1QuotaBucket.findMany({
        where: { tenantId: tenantA, credentialId: credential.id },
      });
      assert.equal(quotaRows.length, 1);
      assert.equal(quotaRows[0].consumed, 2);
      assert.equal(await db.apiV1QuotaBucket.count({ where: { tenantId: tenantB } }), 0);

      // Auth cannot pass until the distributed quota store exists.
      const bearer = 'Bearer ffv1.' + credential.id + '.' + secret.toString('base64url');
      assert.deepEqual(
        await authorizeApiV1Request({
          authorizationHeader: bearer, scope: 'integrations.read', operation: 'GET /api/v1/status',
        }, repo),
        { ok: false, status: 503, code: 'dependency_unavailable' },
      );
      await db.apiCredential.update({ where: { id: credential.id }, data: { revokedAt: new Date() } });
      assert.equal(await repo.findCredential(credential.id) !== null, true); // auth checks revokedAt
      assert.equal((await repo.findCredential(credential.id))?.revokedAt instanceof Date, true);
      await db.apiIntegration.update({
        where: { id: integrationA.id }, data: { status: 'disabled' },
      });
      assert.equal(await repo.findCredential(credential.id), null);
    } finally {
      // CI-only synthetic cleanup; never pointed at Neon.
      if (tenantA || tenantB) {
        const ids = [tenantA, tenantB].filter(Boolean);
        await db.apiV1QuotaBucket.deleteMany({ where: { tenantId: { in: ids } } });
        await db.apiCredentialAudit.deleteMany({ where: { tenantId: { in: ids } } });
        await db.apiCredential.deleteMany({ where: { tenantId: { in: ids } } });
        await db.apiIntegration.deleteMany({ where: { tenantId: { in: ids } } });
        await db.tenantEntitlementGrant.deleteMany({ where: { tenantId: { in: ids } } });
        await db.subscription.deleteMany({ where: { tenantId: { in: ids } } });
        await db.developerTenantGrant.deleteMany({ where: { tenantId: { in: ids } } });
        await db.tenantUser.deleteMany({ where: { tenantId: { in: ids } } });
        if (actorId) await db.user.delete({ where: { id: actorId } });
        if (issuerId) await db.user.delete({ where: { id: issuerId } });
        await db.tenant.deleteMany({ where: { id: { in: ids } } });
      }
      if (ownsPlan && planId) await db.plan.delete({ where: { id: planId } });
      if (oldFlag === undefined) delete process.env.FLIPFORM_API_V1_ENABLED;
      else process.env.FLIPFORM_API_V1_ENABLED = oldFlag;
      await db.$disconnect();
    }
  },
);
