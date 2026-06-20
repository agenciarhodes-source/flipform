import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PublicFormView } from '@/app/f/[slug]/public-form-view';
import { normalizeHostname } from '@/lib/host-routing';

const BLOCKED = new Set(['suspended', 'blocked', 'canceled', 'inactive']);

export default async function CustomDomainPublicFormPage({ params }: { params: { slug: string } }) {
  const host = normalizeHostname(headers().get('host'));
  if (!host || !params.slug) return notFound();
  const customDomain = await prisma.customFormDomain.findFirst({ where: { domain: host } });
  if (!customDomain) return notFound();
  const isReady = customDomain.status === 'active' && customDomain.verificationStatus === 'verified' && customDomain.sslStatus === 'active';
  if (!isReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900">
        <section className="max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold">Domínio ainda não ativo</h1>
          <p className="mt-3 text-sm text-slate-600">Este domínio ainda está em configuração. Use o link padrão do formulário ou tente novamente mais tarde.</p>
        </section>
      </main>
    );
  }
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
