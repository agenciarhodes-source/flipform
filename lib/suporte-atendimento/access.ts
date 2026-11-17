/**
 * Piloto Junqueira: base interna somente leitura.
 * A liberação ocorre por ID exato do tenant, nunca por nome editável/slug.
 * Não reutilizar o mesmo arquivo de cliente para outros tenants.
 */
export const SUPPORT_KNOWLEDGE_ROLES = ['owner', 'admin', 'manager', 'agent'] as const;

export function canReadJunqueiraSupportKnowledge(
  session: { tenantId?: string | null; role?: string | null } | null,
  allowedTenantId: string | undefined,
  globalEnabled = false,
): boolean {
  if (!session?.tenantId) return false;
  if (!SUPPORT_KNOWLEDGE_ROLES.some((role) => role === session.role)) return false;
  if (globalEnabled) return true;
  const expected = allowedTenantId?.trim();
  return Boolean(expected && session.tenantId === expected);
}
