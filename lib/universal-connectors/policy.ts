/** Independent of outbound API v1. No production activation in PR-A. */
export type UniversalActor = Readonly<{ tenantId: string; userId: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function universalConnectAllowed(tenantId: string, env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  if (env.UNIVERSAL_CONNECT_ENABLED !== 'true' || !UUID.test(tenantId)) return false;
  const raw = env.UNIVERSAL_CONNECT_PILOT_TENANT_IDS;
  if (!raw || raw.length > 400) return false;
  const ids = raw.split(',').map(s => s.trim());
  return ids.length <= 10 && ids.every(s => UUID.test(s))
    && new Set(ids).size === ids.length && ids.includes(tenantId);
}
