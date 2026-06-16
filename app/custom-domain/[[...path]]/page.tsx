import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { normalizeHost, normalizeRoutePath } from '@/lib/form-domains';
import { PublicFormView } from '@/app/f/[slug]/public-form-view';

const BLOCKED = new Set(['suspended', 'blocked', 'canceled', 'inactive']);

export default async function CustomDomainFormPage({ params }: { params: { path?: string[] } }) {
  const host = normalizeHost(headers().get('host'));
  const path = normalizeRoutePath((params.path || []).join('/'));
  const domain = await prisma.customFormDomain.findUnique({
    where: { domain: host },
    include: {
      defaultForm: { include: { fields: { orderBy: { orderIndex: 'asc' } }, tenant: { select: { name: true, primaryColor: true, logoUrl: true, status: true } } } },
      routes: { where: { path }, take: 1, include: { form: { include: { fields: { orderBy: { orderIndex: 'asc' } }, tenant: { select: { name: true, primaryColor: true, logoUrl: true, status: true } } } } } },
    },
  });
  if (!domain || domain.status !== 'active' || domain.verificationStatus !== 'verified') return notFound();
  const form = path === '/' ? (domain.routes[0]?.form || domain.defaultForm) : domain.routes[0]?.form;
  if (!form || !form.isActive || BLOCKED.has(String(form.tenant.status))) return notFound();

  const logoUrl = form.logoUrl || form.tenant?.logoUrl || null;
  const primaryColor = form.primaryColor || form.tenant?.primaryColor || '#2563EB';
  return <PublicFormView form={{
    slug: form.slug,
    publicTitle: form.publicTitle,
    publicDescription: form.publicDescription,
    primaryColor,
    bgColor: form.bgColor,
    buttonColor: form.buttonColor,
    textColor: form.textColor,
    theme: form.theme,
    coverImageUrl: form.coverImageUrl,
    successMessage: form.successMessage,
    logoUrl,
    tenantName: form.tenant?.name || '',
    customDomain: host,
    fields: form.fields.map((f: any) => ({
      id: f.id, label: f.label, placeholder: f.placeholder, description: f.description,
      fieldType: f.fieldType, options: f.options as any, isRequired: f.isRequired, orderIndex: f.orderIndex,
    })),
  }} />;
}