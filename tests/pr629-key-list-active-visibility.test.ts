import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { listApiV1Keys } from '../lib/api-v1/integration-management';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INTEGRATION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTIVE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

test('authorized developer can always see an older active key after 30 newer rotations', async () => {
  const previous = process.env.FLIPFORM_API_V1_ENABLED;
  process.env.FLIPFORM_API_V1_ENABLED = 'true'; // synthetic local CI only, never Vercel
  try {
    const createdAt = new Date('2025-01-01T00:00:00Z');
    const active = [{ id: ACTIVE, scopes: ['forms.read'], createdAt, expiresAt: null, revokedAt: null }];
    const history = Array.from({ length: 30 }, (_, i) => ({
      id: `dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12, '0')}`,
      scopes: ['forms.read'],
      createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
      expiresAt: null,
      revokedAt: new Date('2026-01-31T00:00:00Z'),
    }));
    const calls: Array<{ where: Record<string, unknown>; take: number }> = [];
    const db = {
      tenantUser: { findUnique: async () => ({ role: 'viewer', status: 'active' }) },
      developerTenantGrant: { findUnique: async () => ({ revokedAt: null }) },
      user: { findUnique: async () => ({ mfaEnabledAt: new Date('2026-01-01T00:00:00Z') }) },
      tenant: { findUnique: async () => ({
        id: TENANT, status: 'active',
        subscriptions: [{ status: 'active', provider: 'direct', plan: { slug: 'premium-pro', isActive: true } }],
      }) },
      tenantEntitlementGrant: { findMany: async () => [] },
      apiIntegration: { findFirst: async () => ({ id: INTEGRATION }) },
      apiCredential: { findMany: async (params: { where: Record<string, unknown>; take: number }) => {
        calls.push(params);
        return params.where.revokedAt === null ? active : history;
      } },
    } as unknown as PrismaClient;

    const keys = await listApiV1Keys({ userId: 'developer-qa', tenantId: TENANT }, INTEGRATION, db);
    assert.ok(keys);
    assert.equal(keys.length, 31);
    assert.equal(keys[0]?.id, ACTIVE, 'older active key stays available for revocation');
    assert.equal(keys.filter(key => key.id === ACTIVE).length, 1);
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.where.tenantId, TENANT);
    assert.equal(calls[0]?.where.integrationId, INTEGRATION);
    assert.equal(calls[0]?.where.revokedAt, null);
    assert.equal(calls[1]?.take, 30);
  } finally {
    if (previous === undefined) delete process.env.FLIPFORM_API_V1_ENABLED;
    else process.env.FLIPFORM_API_V1_ENABLED = previous;
  }
});
