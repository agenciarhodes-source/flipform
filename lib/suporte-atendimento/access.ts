/**
 * Suporte interno global e privado por empresa.
 * A configuração é exclusiva de Desenvolvedor; a consulta é exclusiva de Atendente.
 * Nunca escolher o manual via tenantId, slug ou nome enviados pelo cliente.
 */
export const SUPPORT_KNOWLEDGE_ROLES = ['agent'] as const;
export const SUPPORT_CONFIG_ROLES = ['developer'] as const;

type SupportSession = { tenantId?: string | null; role?: string | null };

export function canReadTenantSupportKnowledge(session: SupportSession | null): boolean {
  return Boolean(session?.tenantId?.trim() && session.role === 'agent');
}

export function canManageTenantSupportKnowledge(session: SupportSession | null): boolean {
  return Boolean(session?.tenantId?.trim() && session.role === 'developer');
}

/** A ativação da empresa é uma segunda trava, além do papel do atendente. */
export function canUseTenantSupportKnowledge(
  session: SupportSession | null,
  tenantEnabled: boolean,
): boolean {
  return tenantEnabled === true && canReadTenantSupportKnowledge(session);
}
