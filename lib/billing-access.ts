import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import type { SessionPayload } from "./auth";

export const GRACE_DAYS = 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type Status = string | null | undefined;

export type BillingAccessInput = {
  tenantStatus?: Status;
  subscriptionStatus?: Status;
  gracePeriodEndsAt?: Date | string | null;
  now?: Date;
  isSuperAdmin?: boolean;
};

export type BillingAccessReason =
  | "active"
  | "trial"
  | "courtesy"
  | "super_admin"
  | "past_due_grace"
  | "past_due_expired"
  | "suspended"
  | "canceled"
  | "blocked"
  | "unknown";

export type BillingAccessResult = {
  allowAccess: boolean;
  shouldSuspend: boolean;
  showPastDueWarning: boolean;
  reason: BillingAccessReason;
};

export type BillingAccessContext = BillingAccessResult & {
  tenant: {
    id: string;
    status: string;
    name?: string | null;
    slug?: string | null;
    nextDueDate?: Date | null;
  } | null;
  subscription: {
    id: string;
    status: string;
    gracePeriodEndsAt: Date | null;
  } | null;
  payment: {
    invoiceUrl: string | null;
    bankSlipUrl: string | null;
    dueDate: Date | null;
  } | null;
};

export function calculateGracePeriodEndsAt(
  dueDate: Date | string | null | undefined,
  now = new Date(),
): Date {
  const base = dueDate ? new Date(dueDate) : now;
  return new Date(base.getTime() + GRACE_DAYS * MS_PER_DAY);
}

export function evaluateBillingAccess(
  input: BillingAccessInput,
): BillingAccessResult {
  if (input.isSuperAdmin)
    return {
      allowAccess: true,
      shouldSuspend: false,
      showPastDueWarning: false,
      reason: "super_admin",
    };

  const tenantStatus = String(input.tenantStatus || "").toLowerCase();
  const subscriptionStatus = String(
    input.subscriptionStatus || "",
  ).toLowerCase();
  const now = input.now ?? new Date();

  if (subscriptionStatus === "courtesy")
    return {
      allowAccess: true,
      shouldSuspend: false,
      showPastDueWarning: false,
      reason: "courtesy",
    };
  if (tenantStatus === "suspended" || subscriptionStatus === "suspended")
    return {
      allowAccess: false,
      shouldSuspend: false,
      showPastDueWarning: false,
      reason: "suspended",
    };
  if (tenantStatus === "canceled" || subscriptionStatus === "canceled")
    return {
      allowAccess: false,
      shouldSuspend: false,
      showPastDueWarning: false,
      reason: "canceled",
    };
  if (tenantStatus === "blocked" || tenantStatus === "inactive")
    return {
      allowAccess: false,
      shouldSuspend: false,
      showPastDueWarning: false,
      reason: "blocked",
    };

  if (tenantStatus === "past_due" || subscriptionStatus === "past_due") {
    const gracePeriodEndsAt = input.gracePeriodEndsAt
      ? new Date(input.gracePeriodEndsAt)
      : calculateGracePeriodEndsAt(now, now);
    const expired = gracePeriodEndsAt.getTime() < now.getTime();
    return expired
      ? {
          allowAccess: false,
          shouldSuspend: true,
          showPastDueWarning: false,
          reason: "past_due_expired",
        }
      : {
          allowAccess: true,
          shouldSuspend: false,
          showPastDueWarning: true,
          reason: "past_due_grace",
        };
  }

  if (tenantStatus === "trial" || subscriptionStatus === "trialing") {
    return {
      allowAccess: true,
      shouldSuspend: false,
      showPastDueWarning: false,
      reason: "trial",
    };
  }

  if (tenantStatus === "active" || subscriptionStatus === "active")
    return {
      allowAccess: true,
      shouldSuspend: false,
      showPastDueWarning: false,
      reason: "active",
    };

  return {
    allowAccess: true,
    shouldSuspend: false,
    showPastDueWarning: false,
    reason: "unknown",
  };
}

export async function requireBillingAccess(
  session: SessionPayload,
  options: { redirectToBlocked?: boolean } = {},
): Promise<BillingAccessContext> {
  if (session.globalRole === "platform_admin" && !session.tenantId) {
    return {
      ...evaluateBillingAccess({ isSuperAdmin: true }),
      tenant: null,
      subscription: null,
      payment: null,
    };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: {
      id: true,
      status: true,
      name: true,
      slug: true,
      nextDueDate: true,
    },
  });

  const subscription = tenant
    ? await prisma.subscription.findFirst({
        where: { tenantId: tenant.id },
        select: { id: true, status: true, gracePeriodEndsAt: true },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const payment = tenant
    ? await prisma.payment.findFirst({
        where: { tenantId: tenant.id, status: { in: ["pending", "overdue"] } },
        select: { invoiceUrl: true, bankSlipUrl: true, dueDate: true },
        orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
      })
    : null;

  const result = evaluateBillingAccess({
    tenantStatus: tenant?.status,
    subscriptionStatus: subscription?.status,
    gracePeriodEndsAt: subscription?.gracePeriodEndsAt,
    isSuperAdmin: session.globalRole === "platform_admin",
  });

  if (!result.allowAccess && options.redirectToBlocked)
    redirect("/billing/blocked");

  return {
    ...result,
    tenant: tenant ? { ...tenant, status: String(tenant.status) } : null,
    subscription: subscription
      ? { ...subscription, status: String(subscription.status) }
      : null,
    payment,
  };
}

export async function requireActiveTenant(
  session: SessionPayload,
): Promise<BillingAccessContext> {
  return requireBillingAccess(session, { redirectToBlocked: true });
}
