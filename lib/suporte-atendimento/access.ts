/** Central de suporte global por tenant. Acesso depende de sessão verificada,
 * perfil interno permitido e habilitação explícita da configuração do produto.
 * O documento é recuperado sempre usando o tenantId da sessão, nunca nome/slug.
 */
export const SUPPORT_KNOWLEDGE_ROLES = ['owner', 'admin', 'manager', 'agent'] as const;

export function canReadTenantSupportKnowledge(
  session: { tenantId?: string | null; role?: string | null } | null,
  globalEnabled = false,
): boolean {
  return Boolean(
    globalEnabled &&
    session?.tenantId?.trim() &&
    SUPPORT_KNOWLEDGE_ROLES.some((role) => role === session.role),
  );
}
