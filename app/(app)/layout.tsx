import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/app-shell';

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: { id: true, name: true, slug: true, primaryColor: true, logoUrl: true },
  });
  return (
    <AppShell
      session={session}
      tenant={tenant ? { name: tenant.name, slug: tenant.slug, primaryColor: tenant.primaryColor, logoUrl: tenant.logoUrl } : null}
    >
      {children}
    </AppShell>
  );
}
