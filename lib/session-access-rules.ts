/**
 * Who may still use a signed-in session (security protocol S2). The login token is valid for
 * 7 days, but the decision is taken again on the server, from the database: a person removed
 * from the company, a changed role, a revoked Super Admin or "sair de todos os aparelhos" take
 * effect within seconds instead of when the token expires. Pure rules, easy to test.
 */

export type SessionAccessInput = {
  /** Session version written in the token; tokens issued before this protocol have none (= 0). */
  tokenVersion: number | null | undefined;
  user: { sessionVersion: number; globalRole: string | null } | null;
  tenantId: string | null | undefined;
  /** The person's own membership in the company of the session. */
  membership: { role: string; status: string } | null;
  /** Role through an active business group that contains the company, when there is one. */
  groupRole: string | null;
  /** Role written in the token, kept only for a Super Admin without membership. */
  tokenRole: string;
};

export type SessionAccessDecision =
  | { ok: true; role: string; globalRole: string | null }
  | { ok: false; reason: 'user_missing' | 'session_revoked' | 'membership_revoked' };

export function decideSessionAccess(input: SessionAccessInput): SessionAccessDecision {
  if (!input.user) return { ok: false, reason: 'user_missing' };
  if ((input.tokenVersion ?? 0) !== input.user.sessionVersion) return { ok: false, reason: 'session_revoked' };
  const globalRole = input.user.globalRole === 'platform_admin' ? 'platform_admin' : null;
  // Super Admin session without a company.
  if (!input.tenantId) {
    return globalRole ? { ok: true, role: input.tokenRole, globalRole } : { ok: false, reason: 'membership_revoked' };
  }
  if (input.membership && input.membership.status === 'active') {
    return { ok: true, role: input.membership.role, globalRole };
  }
  if (input.groupRole) return { ok: true, role: input.groupRole, globalRole };
  if (globalRole) return { ok: true, role: input.tokenRole, globalRole };
  return { ok: false, reason: 'membership_revoked' };
}

/** Permissions a blocked company still needs, to see and pay what is due. */
export function permissionWorksWhenBlocked(permission: string) {
  return permission === 'BILLING_VIEW' || permission === 'BILLING_MANAGE';
}

/** How long a decision is reused on one server before the database is read again. */
export const SESSION_ACCESS_CACHE_MS = 30_000;
