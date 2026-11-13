import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { requireBillingAccess } from "@/lib/billing-access";
import { getBusinessGroupAccessesForUser } from "@/lib/business-groups";
import { INBOX_PLAN_HOME, inboxPlanAllowsPath, isInboxOnlyPlan } from "@/lib/billing/inbox-plan-rules";

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");

  const pathname = (await headers()).get("x-pathname") || "";
  const isBillingRoute = pathname === "/billing" || pathname.startsWith("/billing/");
  const isGroupRoute = pathname === "/group" || pathname.startsWith("/group/");

  const [tenant, groupState, currentTenantMembership] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        primaryColor: true,
        logoUrl: true,
        status: true,
        nextDueDate: true,
        plan: { select: { slug: true } },
      },
    }),
    getBusinessGroupAccessesForUser(prisma, session.userId),
    prisma.tenantUser.findFirst({
      where: { tenantId: session.tenantId, userId: session.userId, status: "active" },
      select: { id: true },
    }),
  ]);

  const hasBusinessGroupAccess = groupState.accesses.length > 0;
  const currentTenantIsGroupTenant = groupState.accesses.some((group) =>
    group.tenants.some((groupTenant) => groupTenant.id === session.tenantId),
  );
  const isBusinessGroupAnchor = hasBusinessGroupAccess && !currentTenantIsGroupTenant;

  // O tenant técnico serve apenas como âncora de autenticação. Usuários de grupo
  // não devem operar nele nem enxergá-lo como uma unidade de negócio.
  if (isBusinessGroupAnchor && !isGroupRoute) {
    redirect("/group");
  }

  // Plano Inbox: only the attendance screens; any other screen opens the Inbox.
  const inboxOnly = isInboxOnlyPlan(tenant?.plan?.slug) && session.globalRole !== "platform_admin";
  if (inboxOnly && pathname && !inboxPlanAllowsPath(pathname)) {
    redirect(INBOX_PLAN_HOME);
  }

  const billingAccess = await requireBillingAccess(session);
  // A visão do grupo precisa continuar acessível mesmo se a unidade atual ficar
  // bloqueada, para permitir que o responsável escolha outra unidade autorizada.
  if (!billingAccess.allowAccess && !isBillingRoute && !isGroupRoute) {
    redirect("/billing/blocked");
  }

  return (
    <AppShell
      session={session}
      businessGroups={groupState.accesses.map((group) => ({ id: group.id, name: group.name, role: group.role }))}
      hasCurrentTenantMembership={Boolean(currentTenantMembership)}
      isBusinessGroupAnchor={isBusinessGroupAnchor}
      inboxOnly={inboxOnly}
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
