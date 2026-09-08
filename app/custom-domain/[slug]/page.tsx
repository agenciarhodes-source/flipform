import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PublicFormView } from '@/app/f/[slug]/public-form-view';
import { normalizeHostname } from '@/lib/host-routing';
import { resolveMetaRuntimeConfig } from '@/lib/meta/runtime';

const BLOCKED = new Set(['suspended', 'blocked', 'canceled', 'inactive']);

export default async function CustomDomainPublicFormPage({ params }: { params: { slug: string } }) {
  const host = normalizeHostname(headers().get('host'));
  if (!host || !params.slug) return notFound();
  const customDomain = await prisma.customFormDomain.findFirst({
    where: { domain: host, status: 'active', verificationStatus: 'verified', sslStatus: 'active' },
  });
  if (!customDomain) return notFound();
  const form = await prisma.form.findFirst({
    where: { tenantId: customDomain.tenantId, slug: params.slug, isActive: true },
    include: { fields: { orderBy: { orderIndex: 'asc' } }, tenant: { select: { name: true, primaryColor: true, logoUrl: true, status: true } } },
  });
  if (!form || BLOCKED.has(String(form.tenant.status))) return notFound();

  // Match the standard public form route and expose only non-secret browser tracking ids.
  const [gtmSettings, metaRuntime] = await Promise.all([
    prisma.tenantIntegrationSettings.findUnique({
      where: { tenantId: customDomain.tenantId },
      select: { gtmEnabled: true, gtmContainerId: true },
    }),
    resolveMetaRuntimeConfig({ tenantId: customDomain.tenantId }),
  ]);
  const publicGtmContainerId = gtmSettings?.gtmEnabled ? gtmSettings.gtmContainerId : null;
  const publicMetaPixelId = metaRuntime.pixelEnabled ? metaRuntime.pixelId : null;

  const logoUrl = form.logoUrl || form.tenant?.logoUrl || null;
  const primaryColor = form.primaryColor || form.tenant?.primaryColor || '#2563EB';
  return <PublicFormView gtmContainerId={publicGtmContainerId} metaPixelId={publicMetaPixelId} form={{
    slug: form.slug, publicTitle: form.publicTitle, publicDescription: form.publicDescription, primaryColor, bgColor: form.bgColor,
    buttonColor: form.buttonColor, textColor: form.textColor, theme: form.theme, coverImageUrl: form.coverImageUrl, successMessage: form.successMessage,
    disqualificationSettings: form.disqualificationSettings as any,
    logoUrl, tenantName: form.tenant?.name || '', fields: form.fields.map((f) => ({ id: f.id, label: f.label, placeholder: f.placeholder, description: f.description, fieldType: f.fieldType, options: f.options as any, validationRules: f.validationRules as any, isRequired: f.isRequired, orderIndex: f.orderIndex })),
  }} />;
}
