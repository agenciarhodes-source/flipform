import 'server-only';
import { prisma } from '@/lib/prisma';
import { normalizeHostname } from '@/lib/host-routing';
import { selectUniquePublicForm } from '@/lib/forms/public-form-identity-policy';
import { getVerifiedLegacyFormAlias } from '@/lib/forms/verified-legacy-form-aliases';

/**
 * Resolves a public form only when the request host provides a trusted tenant
 * boundary (verified custom domain), or an immutable form ID is supplied on
 * the configured platform host.
 *
 * Legacy platform slug-only URLs require an explicitly reviewed alias manifest;
 * current uniqueness never proves ownership of historical campaigns. Without
 * an approved alias, fail closed. Verified custom domains remain tenant-scoped.
 */
export async function resolvePublicFormIdentity(
  hostHeader: string | null,
  selector: { formId?: string | null; slug?: string | null },
): Promise<{ id: string; tenantId: string } | null> {
  const host = normalizeHostname(hostHeader);
  const appDomain = normalizeHostname(process.env.NEXT_PUBLIC_APP_DOMAIN || 'app.flipform.com.br');
  if (!host) return null;

  const platform =
    host === appDomain ||
    (process.env.NODE_ENV !== 'production' && (host === 'localhost' || host === '127.0.0.1'));

  let tenantId: string | undefined;
  if (!platform) {
    const customDomain = await prisma.customFormDomain.findFirst({
      where: { domain: host, status: 'active', verificationStatus: 'verified', sslStatus: 'active' },
      select: { tenantId: true },
    });
    if (!customDomain) return null;
    tenantId = customDomain.tenantId;
  }

  const formId = selector.formId?.trim();
  if (formId) {
    const form = await prisma.form.findFirst({
      where: { id: formId, isActive: true, ...(tenantId ? { tenantId } : {}) },
      select: { id: true, tenantId: true },
    });
    return form ?? null;
  }

  const slug = selector.slug?.trim();
  if (!slug) return null;

  if (platform) {
    // Never infer historical ownership from a currently unique global slug.
    // An explicit owner-reviewed alias must bind both immutable form ID and tenant.
    const alias = getVerifiedLegacyFormAlias(slug, process.env.PR00_VERIFIED_LEGACY_FORM_ALIASES_JSON);
    if (!alias) return null;
    const form = await prisma.form.findFirst({
      where: { id: alias.formId, tenantId: alias.tenantId, isActive: true },
      select: { id: true, tenantId: true },
    });
    return form ?? null;
  }

  const candidates = await prisma.form.findMany({
    where: { slug, isActive: true, ...(tenantId ? { tenantId } : {}) },
    select: { id: true, tenantId: true },
    take: 2,
  });
  // A verified custom host binds to one tenant; reject unexpected duplicates.
  return selectUniquePublicForm(candidates);
}
