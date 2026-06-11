import { prisma } from "./prisma";
import { evaluateBillingAccess } from "./billing-access";
import { logAudit } from "./audit";

type PrismaLike = typeof prisma;

export async function scanSubscriptionsForSuspension(
  options: { now?: Date; prismaClient?: PrismaLike; logAuditFn?: typeof logAudit } = {},
) {
  const now = options.now ?? new Date();
  const db = options.prismaClient ?? prisma;
  const writeAudit = options.logAuditFn ?? logAudit;

  const subscriptions = await db.subscription.findMany({
    where: {
      status: "past_due",
      paymentRequired: true,
      NOT: { status: "courtesy" },
    },
    select: {
      id: true,
      tenantId: true,
      status: true,
      gracePeriodEndsAt: true,
      tenant: { select: { status: true, name: true } },
    },
  });

  let suspended = 0;
  const suspendedSubscriptionIds: string[] = [];

  for (const sub of subscriptions) {
    const access = evaluateBillingAccess({
      tenantStatus: sub.tenant.status,
      subscriptionStatus: sub.status,
      gracePeriodEndsAt: sub.gracePeriodEndsAt,
      now,
    });

    if (!access.shouldSuspend) continue;

    const updatedSubscription = await db.subscription.updateMany({
      where: { id: sub.id, status: "past_due", NOT: { status: "courtesy" } },
      data: { status: "suspended" },
    });

    if (!updatedSubscription.count) continue;

    await db.tenant.updateMany({
      where: { id: sub.tenantId, status: { notIn: ["canceled", "blocked"] } },
      data: { status: "suspended" },
    });
    await writeAudit({
      tenantId: sub.tenantId,
      entityType: "billing",
      entityId: sub.id,
      action: "billing.subscription_suspended",
      metadata: {
        gracePeriodEndsAt:
          sub.gracePeriodEndsAt?.toISOString?.() ?? sub.gracePeriodEndsAt,
        tenantName: sub.tenant.name,
      },
    });

    suspended += 1;
    suspendedSubscriptionIds.push(sub.id);
  }

  return {
    candidates: subscriptions.length,
    suspended,
    suspendedSubscriptionIds,
  };
}
