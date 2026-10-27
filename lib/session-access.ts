import 'server-only';

import { prisma } from './prisma';
import type { SessionPayload } from './auth';
import { evaluateBillingAccess } from './billing-access';
import { getBusinessGroupAccessesForUser, mapBusinessGroupRoleToTenantRole } from './business-groups';
import { decideSessionAccess, SESSION_ACCESS_CACHE_MS, type SessionAccessDecision } from './session-access-rules';

type Cached<T> = { at: number; value: T };
const accessCache = new Map<string, Cached<SessionAccessDecision>>();
const tenantCache = new Map<string, Cached<{ allow: boolean; status: string | null; reason: string }>>();
const MAX_CACHE_ENTRIES = 5_000;

function remember<T>(cache: Map<string, Cached<T>>, key: string, value: T) {
  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(key, { at: Date.now(), value });
}

function fresh<T>(cache: Map<string, Cached<T>>, key: string) {
  const hit = cache.get(key);
  return hit && Date.now() - hit.at < SESSION_ACCESS_CACHE_MS ? hit.value : null;
}

/** Forgets what this server knew about a person (after "sair de todos os aparelhos"). */
export function forgetSessionAccess(userId: string) {
  for (const key of accessCache.keys()) if (key.startsWith(`${userId}|`)) accessCache.delete(key);
}

async function groupRoleFor(userId: string, tenantId: string) {
  const state = await getBusinessGroupAccessesForUser(prisma, userId).catch(() => null);
  if (!state?.schemaReady) return null;
  const access = state.accesses.find((group) => group.tenants.some((tenant) => tenant.id === tenantId));
  return access ? mapBusinessGroupRoleToTenantRole(access.role) : null;
}

/**
 * The session as the database says it is now: the current role and Super Admin flag, or a
 * refusal when the person was removed, the Super Admin access was revoked or the session was
 * ended on every device.
 */
export async function verifySessionAccess(session: SessionPayload): Promise<
  { ok: true; session: SessionPayload } | { ok: false; reason: string }
> {
  const key = `${session.userId}|${session.tenantId || '-'}|${session.sv ?? 0}`;
  let decision = fresh(accessCache, key);
  if (!decision) {
    const [user, membership] = await Promise.all([
      prisma.user.findUnique({ where: { id: session.userId }, select: { sessionVersion: true, globalRole: true } }),
      session.tenantId
        ? prisma.tenantUser.findFirst({
          where: { tenantId: session.tenantId, userId: session.userId },
          select: { role: true, status: true },
        })
        : Promise.resolve(null),
    ]);
    const groupRole = session.tenantId && user && (!membership || membership.status !== 'active')
      ? await groupRoleFor(session.userId, session.tenantId)
      : null;
    decision = decideSessionAccess({
      tokenVersion: session.sv,
      user: user ? { sessionVersion: user.sessionVersion, globalRole: user.globalRole } : null,
      tenantId: session.tenantId,
      membership: membership ? { role: String(membership.role), status: membership.status } : null,
      groupRole,
      tokenRole: session.role,
    });
    remember(accessCache, key, decision);
  }
  if (!decision.ok) return { ok: false, reason: decision.reason };
  return { ok: true, session: { ...session, role: decision.role, globalRole: decision.globalRole } };
}

/** Whether the company of the session may use the system now (status and billing). */
export async function tenantAccessAllowed(session: SessionPayload) {
  if (session.globalRole === 'platform_admin' || !session.tenantId) {
    return { allow: true, status: null, reason: 'super_admin' };
  }
  const cached = fresh(tenantCache, session.tenantId);
  if (cached) return cached;
  const [tenant, subscription] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { status: true } }),
    prisma.subscription.findFirst({
      where: { tenantId: session.tenantId },
      select: { status: true, gracePeriodEndsAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const value = !tenant
    ? { allow: false, status: null, reason: 'tenant_missing' }
    : (() => {
      const access = evaluateBillingAccess({
        tenantStatus: tenant.status,
        subscriptionStatus: subscription?.status,
        gracePeriodEndsAt: subscription?.gracePeriodEndsAt,
      });
      return { allow: access.allowAccess, status: String(tenant.status), reason: access.reason };
    })();
  remember(tenantCache, session.tenantId, value);
  return value;
}
