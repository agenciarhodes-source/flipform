import 'server-only';
import { prisma } from '@/lib/prisma';
import { activeFeatureGrant, type TenantFeature } from './tenant-feature-rules';

// No positive cache: revocations take effect on the next request.
export async function tenantHasFeature(tenantId: string, feature: TenantFeature): Promise<boolean> {
  if (!tenantId) return false;
  try {
    const now = new Date();
    const grants = await prisma.tenantEntitlementGrant.findMany({
      where: { tenantId, feature, enabled: true, revokedAt: null, startsAt: { lte: now }, expiresAt: { gt: now } },
      select: { enabled: true, revokedAt: true, startsAt: true, expiresAt: true, approvedBy: true, reason: true },
    });
    return grants.some(grant => activeFeatureGrant(grant, new Date()));
  } catch { return false; }
}
