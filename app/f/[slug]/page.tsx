import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PublicFormView } from './public-form-view';

export default async function PublicFormPage({ params }: { params: { slug: string } }) {
  const form = await prisma.form.findFirst({
    where: { slug: params.slug, isActive: true },
    include: {
      fields: { orderBy: { orderIndex: 'asc' } },
      tenant: { select: { name: true, primaryColor: true, logoUrl: true } },
    },
  });
  if (!form) return notFound();
  // Logo: prioriza form.logoUrl, fallback para tenant.logoUrl
  // Cor: prioriza form.primaryColor, fallback para tenant.primaryColor
  const logoUrl = form.logoUrl || form.tenant?.logoUrl || null;
  const primaryColor = form.primaryColor || form.tenant?.primaryColor || '#2563EB';
  return <PublicFormView form={{
    slug: form.slug,
    publicTitle: form.publicTitle,
    publicDescription: form.publicDescription,
    primaryColor,
    successMessage: form.successMessage,
    logoUrl,
    tenantName: form.tenant?.name || '',
    fields: form.fields.map((f) => ({
      id: f.id, label: f.label, placeholder: f.placeholder, description: f.description,
      fieldType: f.fieldType, options: f.options as any, isRequired: f.isRequired, orderIndex: f.orderIndex,
    })),
  }} />;
}
