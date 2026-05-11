import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PublicFormView } from './public-form-view';

export default async function PublicFormPage({ params }: { params: { slug: string } }) {
  const form = await prisma.form.findFirst({
    where: { slug: params.slug, isActive: true },
    include: { fields: { orderBy: { orderIndex: 'asc' } } },
  });
  if (!form) return notFound();
  return <PublicFormView form={{
    slug: form.slug,
    publicTitle: form.publicTitle,
    publicDescription: form.publicDescription,
    primaryColor: form.primaryColor,
    successMessage: form.successMessage,
    fields: form.fields.map((f) => ({
      id: f.id, label: f.label, placeholder: f.placeholder, description: f.description,
      fieldType: f.fieldType, options: f.options as any, isRequired: f.isRequired, orderIndex: f.orderIndex,
    })),
  }} />;
}
