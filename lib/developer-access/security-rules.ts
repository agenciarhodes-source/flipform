/** Pure, fail-closed boundaries for critical technical access. */
export function needsFreshTechnicalSession(session: { role: string; mfaVerifiedAt?: number }): boolean {
  return session.role === 'developer' || session.mfaVerifiedAt !== undefined;
}

export function mayProvisionDeveloperMembership(input: {
  existingMembership: { status: string } | null;
  existingAllowlist: { active: boolean; status: string } | null;
}): boolean {
  return (!input.existingMembership || input.existingMembership.status === 'active')
    && (!input.existingAllowlist || (input.existingAllowlist.active && input.existingAllowlist.status === 'active'));
}

export function mayUseDeveloperGrant(input: {
  hasGrant: boolean; revoked: boolean; mfaVerified: boolean; mfaEnabled: boolean;
  membershipActive: boolean; allowlistActive: boolean;
}): boolean {
  return input.hasGrant && !input.revoked && input.mfaVerified && input.mfaEnabled
    && input.membershipActive && input.allowlistActive;
}
