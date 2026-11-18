import 'server-only';
import { prisma } from '@/lib/prisma';
import { normalizeHostname } from '@/lib/host-routing';
import { selectUniquePublicForm } from '@/lib/forms/public-form-identity-policy';

/**
 * Resolves a public form only when the request host provides a trusted tenant
 * boundary (verified custom domain), or an immutable form ID is supplied on
 * the configured platform host.
 *
 * Legacy slug-only platform requests may still resolve when unique across
 * active tenants. This is a provisional migration bridge: it does not prove
 * historical URL ownership and MUST NOT be deployed without the legacy-link
 * mapping and business-compatibility gate.
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

  const candidates = await prisma.form.findMany({
    where: { slug, isActive: true, ...(tenantId ? { tenantId } : {}) },
    select: { id: true, tenantId: true },
    take: 2,
  });
  // Never choose the "first" tenant when slug identity is ambiguous.
  return selectUniquePublicForm(candidates);
}
