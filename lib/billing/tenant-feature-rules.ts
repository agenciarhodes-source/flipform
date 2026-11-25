export type TenantFeature = 'lead_cpf' | 'closing_signed_check' | 'gojus_sheet' | 'gojus_robot' | 'gojus_status_lookup';
export type FeatureGrant = { enabled: boolean; revokedAt: Date | null; startsAt: Date; expiresAt: Date; approvedBy: string; reason: string };
export function activeFeatureGrant(grant: FeatureGrant, now: Date): boolean {
  return grant.enabled && grant.revokedAt === null && grant.startsAt <= now && grant.expiresAt > now && !!grant.approvedBy.trim() && !!grant.reason.trim();
}
