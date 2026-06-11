import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { requireBillingAccess } from "@/lib/billing-access";

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const pathname = headers().get("x-pathname") || "";
  const isBillingRoute = pathname === "/billing" || pathname.startsWith("/billing/");

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      primaryColor: true,
      logoUrl: true,
      status: true,
      nextDueDate: true,
    },
  });

  const billingAccess = await requireBillingAccess(session);
  if (!billingAccess.allowAccess && !isBillingRoute) {
    redirect("/billing/blocked");
  }

  return (
    <AppShell
      session={session}
      tenant={
        tenant
          ? {
              name: tenant.name,
              slug: tenant.slug,
              primaryColor: tenant.primaryColor,
              logoUrl: tenant.logoUrl,
              status: tenant.status,
              nextDueDate: tenant.nextDueDate
                ? tenant.nextDueDate.toISOString()
                : null,
              gracePeriodEndsAt: billingAccess.subscription?.gracePeriodEndsAt
                ? billingAccess.subscription.gracePeriodEndsAt.toISOString()
                : null,
              paymentUrl:
                billingAccess.payment?.invoiceUrl ||
                billingAccess.payment?.bankSlipUrl ||
                null,
            }
          : null
      }
    >
      {children}
    </AppShell>
  );
}
