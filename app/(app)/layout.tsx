import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/app-shell';
import { evaluateBillingAccess } from '@/lib/billing-access';

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: { id: true, name: true, slug: true, primaryColor: true, logoUrl: true, status: true, nextDueDate: true },
  });

  const sub = tenant
    ? await prisma.subscription.findFirst({
        where: { tenantId: tenant.id },
        select: { status: true, gracePeriodEndsAt: true },
        orderBy: { createdAt: 'desc' },
      })
    : null;

  const access = evaluateBillingAccess({
    tenantStatus: tenant?.status,
    subscriptionStatus: sub?.status,
    gracePeriodEndsAt: sub?.gracePeriodEndsAt,
  });

  if (!access.allowed) redirect('/billing/blocked');

  return (
    <AppShell
      session={session}
      tenant={tenant ? {
        name: tenant.name,
        slug: tenant.slug,
        primaryColor: tenant.primaryColor,
        logoUrl: tenant.logoUrl,
        status: tenant.status,
        nextDueDate: tenant.nextDueDate ? tenant.nextDueDate.toISOString() : null,
      } : null}
    >
      {children}
    </AppShell>
  );
}
