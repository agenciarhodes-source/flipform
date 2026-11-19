import 'server-only';

import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { canManageApiV1Keys, apiV1Enabled, apiV1Entitled, type ApiV1Entitlement } from './policy';
import type { ApiV1CredentialRecord, ApiV1CredentialRepository } from './identity';

/**
 * PR01 Phase 2: read-only backing store for credentials and tenant entitlements.
 * The API is NOT wired to this store, credential issuance is NOT available, and
 * no actual API key or database migration is provisioned by this module.
 */
type ApiV1Db = Pick<PrismaClient, 'apiCredential' | 'tenant' | 'tenantUser' | 'tenantEntitlementGrant'>;

export class PrismaApiV1CredentialRepository implements ApiV1CredentialRepository {
  constructor(private readonly db: ApiV1Db = prisma) {}

  async findCredential(id: string): Promise<ApiV1CredentialRecord | null> {
    const row = await this.db.apiCredential.findUnique({
      where: { id },
      select: {
        id: true, tenantId: true, integrationId: true, secretHashHex: true,
        scopes: true, revokedAt: true, expiresAt: true,
        integration: { select: { tenantId: true, status: true } },
      },
    });

    // The composite FK also enforces this at the database level. Double-check
    // at the application boundary; disabled integrations are not usable.
    if (!row || row.integration.tenantId !== row.tenantId || row.integration.status !== 'active') {
      return null;
    }
    return {
      id: row.id, tenantId: row.tenantId, integrationId: row.integrationId,
      secretHashHex: row.secretHashHex, scopes: row.scopes,
      revokedAt: row.revokedAt, expiresAt: row.expiresAt,
    };
  }

  async findTenantEntitlement(tenantId: string): Promise<ApiV1Entitlement | null> {
    if (!tenantId) return null;
    const now = new Date();
    const [tenant, approvedGrants] = await Promise.all([
      this.db.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true, status: true,
          subscriptions: {
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: {
              status: true, provider: true,
              plan: { select: { slug: true, isActive: true } },
            },
          },
        },
      }),
      this.db.tenantEntitlementGrant.findMany({
        where: {
          tenantId, feature: 'api_v1', enabled: true,
          revokedAt: null, startsAt: { lte: now }, expiresAt: { gt: now },
        },
        select: { approvedBy: true, reason: true },
      }),
    ]);
    if (!tenant) return null;

    // Group-billing rows are deliberately NOT treated as an API entitlement
    // until payer + group provenance are independently reconciled. They can
    // still be granted a bounded, explicit per-tenant exception.
    const latest = tenant.subscriptions[0] ?? null;
    const direct = latest && latest.provider !== 'business_group' ? latest : null;
    const exceptionalGrantActive = approvedGrants.some((g) =>
      Boolean(g.approvedBy.trim() && g.reason.trim()));

    return {
      tenantId: tenant.id,
      tenantStatus: tenant.status,
      subscriptionStatus: direct?.status ?? null,
      planSlug: direct?.plan.slug ?? null,
      planActive: direct?.plan.isActive ?? false,
      featureEnabled: apiV1Enabled(process.env),
      exceptionalGrantActive,
    };
  }

  async consumeQuota(): Promise<boolean> {
    // Distributed atomic quotas are a separate gate. No in-memory fallback and
    // no 200/authorization path is possible from this repository until then.
    throw new Error('API_V1_DISTRIBUTED_QUOTA_NOT_IMPLEMENTED');
  }
}

/**
 * Read-only authorization gate for a future issuance service. It does not
 * create keys and does not trust an actor-provided role or tenant override.
 */
export async function mayManageApiV1Credentials(
  actor: { userId: string; tenantId: string },
  targetTenantId: string,
  db: ApiV1Db = prisma,
): Promise<boolean> {
  if (!actor.userId || !actor.tenantId || actor.tenantId !== targetTenantId) return false;
  try {
    const member = await db.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId: targetTenantId, userId: actor.userId } },
      select: { role: true, status: true },
    });
    if (!member || member.status !== 'active'
      || !canManageApiV1Keys(member.role, actor.tenantId, targetTenantId)) return false;
    const entitlement = await new PrismaApiV1CredentialRepository(db).findTenantEntitlement(targetTenantId);
    return apiV1Entitled(targetTenantId, entitlement);
  } catch {
    return false;
  }
}
