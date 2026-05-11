import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { SettingsPageClient } from '@/components/settings-page-client';

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'SETTINGS_VIEW')) {
    return <div className="p-8"><div className="rounded-md border border-dashed p-12 text-center text-muted-foreground">Acesso restrito.</div></div>;
  }
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: {
      id: true, name: true, slug: true, primaryColor: true, logoUrl: true,
      status: true, createdAt: true,
      _count: { select: { tenantUsers: true, leads: true, forms: true, pipelines: true } },
    },
  });
  if (!tenant) return <div className="p-8">Tenant não encontrado.</div>;
  return <SettingsPageClient initialTenant={JSON.parse(JSON.stringify(tenant))} role={session.role} />;
}
