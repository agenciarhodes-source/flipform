import 'server-only';

import { prisma } from './prisma';
import { needsFreshTechnicalSession, mayUseDeveloperGrant } from './developer-access/security-rules';
import type { SessionPayload } from './auth';
import { evaluateBillingAccess } from './billing-access';
import { getBusinessGroupAccessesForUser, mapBusinessGroupRoleToTenantRole } from './business-groups';
import { decideSessionAccess, SESSION_ACCESS_CACHE_MS, type SessionAccessDecision } from './session-access-rules';

type Cached<T> = { at: number; value: T };
const accessCache = new Map<string, Cached<SessionAccessDecision>>();
const tenantCache = new Map<string, Cached<{ allow: boolean; status: string | null; reason: string }>>();
const planCache = new Map<string, Cached<string | null>>();
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

/** The role through an active business group: of the group with this company, or any group (hub). */
async function groupRoleFor(userId: string, tenantId: string | null) {
  const state = await getBusinessGroupAccessesForUser(prisma, userId).catch(() => null);
  if (!state?.schemaReady) return null;
  const access = tenantId
    ? state.accesses.find((group) => group.tenants.some((tenant) => tenant.id === tenantId))
    : state.accesses[0];
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
    // The group role is read also with a membership below owner: a group owner or admin keeps
    // that role inside each company of the group (their own user there is a Gestor).
    const needsGroup = user && user.globalRole !== 'platform_admin'
      && (!session.tenantId || !membership || membership.status !== 'active' || String(membership.role) !== 'owner');
    const groupRole = needsGroup ? await groupRoleFor(session.userId, session.tenantId || null) : null;
    decision = decideSessionAccess({
      tokenVersion: session.sv,
      user: user ? { sessionVersion: user.sessionVersion, globalRole: user.globalRole } : null,
      tenantId: session.tenantId,
      membership: membership ? { role: String(membership.role), status: membership.status } : null,
      groupRole,
      tokenRole: session.role,
    });
    if (!technicalSession) remember(accessCache, key, decision);
  }
  if (!decision.ok) return { ok: false, reason: decision.reason };
  // Critical entitlement is never taken from JWT or the 30-second access cache.
  // A grant is scoped to exactly one tenant and is rechecked on every verified request.
  // A developer role in a cookie, including a stale or forged claim, is never a grant.
  let role = decision.role === 'developer' ? 'viewer' : decision.role;
  if (session.tenantId && Number.isSafeInteger(session.mfaVerifiedAt)
    && (session.mfaVerifiedAt ?? 0) > 0
    && Date.now() / 1000 - (session.mfaVerifiedAt ?? 0) < 7 * 24 * 60 * 60
    && (session.mfaVerifiedAt ?? 0) <= Date.now() / 1000 + 60) {
    try {
      const [grant, account, membership] = await Promise.all([
        prisma.developerTenantGrant.findUnique({
          where: { tenantId_userId: { tenantId: session.tenantId, userId: session.userId } },
          select: { revokedAt: true },
        }),
        prisma.user.findUnique({ where: { id: session.userId }, select: { mfaEnabledAt: true, email: true } }),
        prisma.tenantUser.findUnique({
          where: { tenantId_userId: { tenantId: session.tenantId, userId: session.userId } },
          select: { status: true },
        }),
      ]);
      const allowlist = account?.email ? await prisma.allowedUser.findUnique({
        where: { tenantId_email: { tenantId: session.tenantId, email: account.email } },
        select: { active: true, status: true },
      }) : null;
      if (mayUseDeveloperGrant({
        hasGrant: !!grant, revoked: !!grant?.revokedAt, mfaVerified: true,
        mfaEnabled: !!account?.mfaEnabledAt,
        membershipActive: membership?.status === 'active',
        allowlistActive: allowlist?.active === true && allowlist?.status === 'active',
      })) role = 'developer';
    } catch {
      // Fail closed: no technical entitlement during database errors.
    }
  }
  return { ok: true, session: { ...session, role, globalRole: decision.globalRole } };
}

/** The plan slug of a company, reused for a few seconds like the other access decisions. */
export async function tenantPlanSlug(tenantId: string) {
  const cached = planCache.get(tenantId);
  if (cached && Date.now() - cached.at < SESSION_ACCESS_CACHE_MS) return cached.value;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: { select: { slug: true } } } });
  const slug = tenant?.plan?.slug ?? null;
  remember(planCache, tenantId, slug);
  return slug;
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
