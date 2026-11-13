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
  /**
   * Role through an active business group: the group that contains the company of the session,
   * or, for the group hub session (no company yet), any active group of the person.
   */
  groupRole: string | null;
  /** Role written in the token, kept only for a Super Admin without membership. */
  tokenRole: string;
};

export type SessionAccessDecision =
  | { ok: true; role: string; globalRole: string | null }
  | { ok: false; reason: 'user_missing' | 'session_revoked' | 'membership_revoked' };

const ROLE_RANK: Record<string, number> = { viewer: 1, agent: 2, manager: 3, admin: 4, owner: 5 };

/**
 * The stronger of two roles. The owner or admin of a business group also has a Gestor user in
 * each company of the group (so the team sees them); inside the company they keep the group's
 * role (Dono do grupo = owner, Administrador do grupo = admin), never less.
 */
export function strongerRole(own: string, group: string | null) {
  if (!group) return own;
  return (ROLE_RANK[group] || 0) > (ROLE_RANK[own] || 0) ? group : own;
}

export function decideSessionAccess(input: SessionAccessInput): SessionAccessDecision {
  if (!input.user) return { ok: false, reason: 'user_missing' };
  if ((input.tokenVersion ?? 0) !== input.user.sessionVersion) return { ok: false, reason: 'session_revoked' };
  const globalRole = input.user.globalRole === 'platform_admin' ? 'platform_admin' : null;
  // Session without a company: the Super Admin, or the business group hub (the person picks a
  // company of the group after signing in).
  if (!input.tenantId) {
    if (globalRole) return { ok: true, role: input.tokenRole, globalRole };
    if (input.groupRole) return { ok: true, role: input.groupRole, globalRole };
    return { ok: false, reason: 'membership_revoked' };
  }
  if (input.membership && input.membership.status === 'active') {
    return { ok: true, role: strongerRole(input.membership.role, input.groupRole), globalRole };
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
