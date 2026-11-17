/**
 * Piloto Junqueira: base interna somente leitura.
 * A liberação ocorre por ID exato do tenant, nunca por nome editável/slug.
 * Não reutilizar o mesmo arquivo de cliente para outros tenants.
 */
export const SUPPORT_KNOWLEDGE_ROLES = ['owner', 'admin', 'manager', 'agent'] as const;

export function canReadJunqueiraSupportKnowledge(
  session: { tenantId?: string | null; role?: string | null } | null,
  allowedTenantId: string | undefined,
): boolean {
  if (!session?.tenantId || !allowedTenantId) return false;
  const expected = allowedTenantId.trim();
  if (!expected || session.tenantId !== expected) return false;
  return SUPPORT_KNOWLEDGE_ROLES.some((role) => role === session.role);
}
