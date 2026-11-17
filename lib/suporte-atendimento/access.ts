/**
 * Suporte interno global e privado por empresa.
 * A configuração é exclusiva de Proprietário; a consulta é exclusiva de Atendente.
 * O papel técnico "Desenvolvedor" NÃO existe no RBAC atual: qualquer delegação
 * futura deve ter permissão própria, auditoria e aprovação explícita.
 * Nunca escolher o manual via tenantId, slug ou nome enviados pelo cliente.
 */
export const SUPPORT_KNOWLEDGE_ROLES = ['agent'] as const;
export const SUPPORT_CONFIG_ROLES = ['owner'] as const;

type SupportSession = { tenantId?: string | null; role?: string | null };

export function canReadTenantSupportKnowledge(session: SupportSession | null): boolean {
  return Boolean(session?.tenantId?.trim() && session.role === 'agent');
}

export function canManageTenantSupportKnowledge(session: SupportSession | null): boolean {
  return Boolean(session?.tenantId?.trim() && session.role === 'owner');
}
