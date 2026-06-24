import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PublicFormView } from './public-form-view';

const BLOCKED = new Set(['suspended', 'blocked', 'canceled', 'inactive']);

export default async function PublicFormPage({ params }: { params: { slug: string } }) {
  const form = await prisma.form.findFirst({
    where: { slug: params.slug, isActive: true },
    include: {
      fields: { orderBy: { orderIndex: 'asc' } },
      tenant: { select: { name: true, primaryColor: true, logoUrl: true, status: true } },
    },
  });
  if (!form) return notFound();

  // Tenant bloqueado: mostra tela amigável de indisponibilidade
  if (BLOCKED.has(String(form.tenant.status))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md bg-white border rounded-lg p-8 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /></svg>
          </div>
          <h1 className="font-heading text-xl font-bold mb-2">Formulário indisponível</h1>
          <p className="text-sm text-muted-foreground">Este formulário está temporariamente fora do ar. Tente novamente mais tarde.</p>
        </div>
      </div>
    );
  }

  // Logo: prioriza form.logoUrl, fallback para tenant.logoUrl
  // Cor: prioriza form.primaryColor, fallback para tenant.primaryColor
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
    disqualificationSettings: form.disqualificationSettings as any,
    logoUrl,
    tenantName: form.tenant?.name || '',
    fields: form.fields.map((f: {id: string; label: string; fieldType: string; isRequired: boolean; placeholder?: string | null; description?: string | null; options?: unknown; orderIndex: number; validationRules?: unknown}) => ({
      id: f.id, label: f.label, placeholder: f.placeholder, description: f.description,
      fieldType: f.fieldType, options: f.options as any, validationRules: f.validationRules as any, isRequired: f.isRequired, orderIndex: f.orderIndex,
    })),
  }} />;
}
