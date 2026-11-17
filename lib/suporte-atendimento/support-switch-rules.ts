/**
 * Política do Suporte: cada empresa começa DESLIGADA, inclusive empresas com
 * Markdown já cadastrado. Falta/invalidade do estado nunca significa 'ligado'.
 * Funções puras para testes sem R2 ou dados reais.
 */
export type TenantSupportActivation = {
  enabled: boolean;
  revision: number;
  updatedAt: string | null;
};

export const DEFAULT_SUPPORT_ACTIVATION: TenantSupportActivation = Object.freeze({
  enabled: false,
  revision: 0,
  updatedAt: null,
});

export function parseTenantSupportActivation(value: unknown): TenantSupportActivation {
  if (value === null || value === undefined) return DEFAULT_SUPPORT_ACTIVATION;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SUPPORT_ACTIVATION_INVALID');
  const obj = value as Record<string, unknown>;
  if (typeof obj.enabled !== 'boolean' ||
      !Number.isSafeInteger(obj.revision) || (obj.revision as number) < 1 ||
      typeof obj.updatedAt !== 'string' || !Number.isFinite(Date.parse(obj.updatedAt))) {
    throw new Error('SUPPORT_ACTIVATION_INVALID');
  }
  return {
    enabled: obj.enabled,
    revision: obj.revision as number,
    updatedAt: obj.updatedAt,
  };
}
