import { z } from 'zod';

/**
 * Explicit classification of a tenant, set by the platform admin. It replaces
 * guessing from names, internal notes or roles to decide what is a customer.
 */
export const TENANT_ACCOUNT_KINDS = ['unclassified', 'client', 'internal_test', 'technical_access'] as const;
export type TenantAccountKind = (typeof TENANT_ACCOUNT_KINDS)[number];

export const TENANT_ACCOUNT_KIND_LABELS: Record<TenantAccountKind, string> = {
  unclassified: 'Não classificado',
  client: 'Cliente',
  internal_test: 'Teste interno',
  technical_access: 'Acesso técnico',
};

export const tenantAccountKindSchema = z.object({ accountKind: z.enum(TENANT_ACCOUNT_KINDS) }).strict();

export function isTenantAccountKind(value: unknown): value is TenantAccountKind {
  return typeof value === 'string' && (TENANT_ACCOUNT_KINDS as readonly string[]).includes(value);
}
