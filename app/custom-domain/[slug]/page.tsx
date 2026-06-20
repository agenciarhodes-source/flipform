import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PublicFormView } from '@/app/f/[slug]/public-form-view';
import { normalizeHostname } from '@/lib/host-routing';

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
  const logoUrl = form.logoUrl || form.tenant?.logoUrl || null;
  const primaryColor = form.primaryColor || form.tenant?.primaryColor || '#2563EB';
  return <PublicFormView form={{
    slug: form.slug, publicTitle: form.publicTitle, publicDescription: form.publicDescription, primaryColor, bgColor: form.bgColor,
    buttonColor: form.buttonColor, textColor: form.textColor, theme: form.theme, coverImageUrl: form.coverImageUrl, successMessage: form.successMessage,
    logoUrl, tenantName: form.tenant?.name || '', fields: form.fields.map((f) => ({ id: f.id, label: f.label, placeholder: f.placeholder, description: f.description, fieldType: f.fieldType, options: f.options as any, isRequired: f.isRequired, orderIndex: f.orderIndex })),
  }} />;
}
