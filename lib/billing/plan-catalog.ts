/**
 * Official FlipForm plan catalog (October 2026): the prices, limits and features approved by the
 * owner. The live values are in the plans table; this file is the reference to recreate or check
 * them (migration 20261027120000_plan_catalog_october_2026, the demo seed and the tests use it).
 *
 * When a price or feature changes in the database, change it here too, in the same PR as a new
 * migration, so it is never lost. Limits: 0 means unlimited. The slug never changes.
 */

export type CatalogPlan = {
  slug: string;
  name: string;
  description: string;
  price: number;
  maxUsers: number;
  maxForms: number;
  maxPipelines: number;
  maxLeadsPerMonth: number;
  canUseReports: boolean;
  canExportCsv: boolean;
  canUseCustomBranding: boolean;
  canUseMetaPixel: boolean;
  canUseWebhooks: boolean;
  canUseTasks: boolean;
  isActive: boolean;
};

export const PLAN_CATALOG_VERSION = '2026-10';

/** Plans sold to customers, from the cheapest; each one has everything the previous has. */
export const PLAN_CATALOG: readonly CatalogPlan[] = [
  {
    slug: 'starter', name: 'Starter', description: 'Para times pequenos', price: 49,
    maxUsers: 5, maxForms: 5, maxPipelines: 2, maxLeadsPerMonth: 1000,
    canUseReports: false, canExportCsv: false, canUseCustomBranding: false, canUseMetaPixel: false, canUseWebhooks: false, canUseTasks: true,
    isActive: true,
  },
  {
    slug: 'growth', name: 'Growth', description: 'Plano recomendado para operação comercial em crescimento.', price: 197,
    maxUsers: 5, maxForms: 10, maxPipelines: 3, maxLeadsPerMonth: 3000,
    canUseReports: true, canExportCsv: true, canUseCustomBranding: true, canUseMetaPixel: true, canUseWebhooks: false, canUseTasks: true,
    isActive: true,
  },
  {
    slug: 'pro', name: 'Pro', description: 'Para times em crescimento', price: 349,
    maxUsers: 15, maxForms: 20, maxPipelines: 0, maxLeadsPerMonth: 0,
    canUseReports: true, canExportCsv: true, canUseCustomBranding: true, canUseMetaPixel: true, canUseWebhooks: true, canUseTasks: true,
    isActive: true,
  },
  {
    slug: 'business', name: 'Business', description: 'Empresas com alto volume de leads', price: 599,
    maxUsers: 50, maxForms: 100, maxPipelines: 0, maxLeadsPerMonth: 0,
    canUseReports: true, canExportCsv: true, canUseCustomBranding: true, canUseMetaPixel: true, canUseWebhooks: true, canUseTasks: true,
    isActive: true,
  },
  {
    slug: 'premium', name: 'Premium', description: 'FlipForm Premium + consumo de IA', price: 997,
    maxUsers: 0, maxForms: 0, maxPipelines: 0, maxLeadsPerMonth: 0,
    canUseReports: true, canExportCsv: true, canUseCustomBranding: true, canUseMetaPixel: true, canUseWebhooks: true, canUseTasks: true,
    isActive: true,
  },
];

/** Plans kept in the table but not sold (free tier and the inactive Premium Pro). */
export const PLAN_CATALOG_UNSOLD: readonly CatalogPlan[] = [
  {
    slug: 'free', name: 'Free', description: 'Plano gratuito para testar', price: 0,
    maxUsers: 2, maxForms: 1, maxPipelines: 0, maxLeadsPerMonth: 0,
    canUseReports: false, canExportCsv: false, canUseCustomBranding: false, canUseMetaPixel: false, canUseWebhooks: false, canUseTasks: true,
    isActive: true,
  },
  {
    slug: 'premium-pro', name: 'Premium Pro', description: 'FlipForm Premium Pro + consumo de IA', price: 1497,
    maxUsers: 0, maxForms: 0, maxPipelines: 0, maxLeadsPerMonth: 0,
    canUseReports: true, canExportCsv: true, canUseCustomBranding: true, canUseMetaPixel: true, canUseWebhooks: true, canUseTasks: true,
    isActive: false,
  },
];

export function catalogPlan(slug: string) {
  return [...PLAN_CATALOG, ...PLAN_CATALOG_UNSOLD].find((plan) => plan.slug === slug) || null;
}
