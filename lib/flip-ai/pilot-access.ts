import 'server-only';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PILOT_TENANTS = 10;

export type FlipAiPilotAllowlist = {
  configured: boolean;
  valid: boolean;
  tenantIds: ReadonlySet<string>;
};

export function parseFlipAiPilotTenantIds(raw: string | undefined | null): FlipAiPilotAllowlist {
  const value = String(raw || '').trim();
  if (!value) return { configured: false, valid: true, tenantIds: new Set() };
  const entries = value.split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  const unique = new Set(entries);
  if (entries.length !== unique.size
    || entries.length > MAX_PILOT_TENANTS
    || entries.some((entry) => !UUID.test(entry))) {
    return { configured: true, valid: false, tenantIds: new Set() };
  }
  return { configured: true, valid: true, tenantIds: unique };
}

export function isFlipAiPilotTenant(
  tenantId: string,
  raw = process.env.FLIP_AI_PILOT_TENANT_IDS,
): boolean {
  const allowlist = parseFlipAiPilotTenantIds(raw);
  return allowlist.valid && allowlist.tenantIds.has(tenantId.toLowerCase());
}
