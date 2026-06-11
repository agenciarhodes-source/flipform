import { NextResponse } from "next/server";
import { captureServerException } from "@/lib/observability";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { mapPaymentStatus, validateWebhookToken } from "@/lib/asaas";
import {
  calculateGracePeriodEndsAt,
  evaluateBillingAccess,
} from "@/lib/billing-access";
import { logAudit } from "@/lib/audit";
import {
  createFirstAccessToken,
  hasRecentActiveFirstAccessToken,
} from "@/lib/first-access";
import { sendTransactionalEmail } from "@/lib/email/send";
import { getAppLoginUrl } from "@/lib/public-urls";

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit({
      key: `webhook:asaas:ip:${ip}`,
      limit: 120,
      windowMs: 60 * 1000,
    });
    if (!rl.allowed) return rateLimitResponse(rl);

    if (!validateWebhookToken(req))
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const payload = await req.json().catch(() => ({}));
    const event = String(payload.event || payload.type || "UNKNOWN");
    const eventId = String(
      payload.id || payload.eventId || `${event}-${Date.now()}`,
    );
    const payment = payload.payment || {};
    const providerPaymentId = payment.id ? String(payment.id) : null;
    const providerSubscriptionId = payment.subscription
      ? String(payment.subscription)
      : null;
    const externalReference = payment.externalReference
      ? String(payment.externalReference)
      : null;

    const exists = await prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider: "asaas", eventId } },
    });
    if (exists) return NextResponse.json({ ok: true, duplicate: true });

    const tenant =
      (providerPaymentId
        ? await prisma.payment.findFirst({
            where: { providerPaymentId },
            select: {
              tenantId: true,
              subscriptionId: true,
              dueDate: true,
              invoiceUrl: true,
              bankSlipUrl: true,
            },
          })
        : null) ||
      (providerSubscriptionId
        ? await prisma.subscription.findFirst({
            where: { providerSubscriptionId },
            select: {
              tenantId: true,
              id: true,
              nextDueDate: true,
              payments: {
                where: { status: { in: ["pending", "overdue"] } },
                select: { dueDate: true, invoiceUrl: true, bankSlipUrl: true },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
          }).then((subscription) =>
            subscription
              ? {
                  tenantId: subscription.tenantId,
                  subscriptionId: subscription.id,
                  dueDate: subscription.payments[0]?.dueDate || subscription.nextDueDate,
                  invoiceUrl: subscription.payments[0]?.invoiceUrl || null,
                  bankSlipUrl: subscription.payments[0]?.bankSlipUrl || null,
                }
              : null,
          )
        : null) ||
      (externalReference
        ? await prisma.subscription.findFirst({
            where: { tenantId: externalReference },
            select: {
              tenantId: true,
              id: true,
              nextDueDate: true,
              payments: {
                where: { status: { in: ["pending", "overdue"] } },
                select: { dueDate: true, invoiceUrl: true, bankSlipUrl: true },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
            orderBy: { createdAt: "desc" },
          }).then((subscription) =>
            subscription
              ? {
                  tenantId: subscription.tenantId,
                  subscriptionId: subscription.id,
                  dueDate: subscription.payments[0]?.dueDate || subscription.nextDueDate,
                  invoiceUrl: subscription.payments[0]?.invoiceUrl || null,
                  bankSlipUrl: subscription.payments[0]?.bankSlipUrl || null,
                }
              : null,
          )
        : null);

    await prisma.webhookEvent.create({
      data: {
        provider: "asaas",
        eventId,
        eventType: event,
        providerPaymentId,
        rawPayload: payload,
        processedAt: new Date(),
        tenantId: tenant?.tenantId || null,
      },
    });

    if (tenant?.tenantId && providerPaymentId) {
      const paymentStatus = mapPaymentStatus(payment.status || event);
      await prisma.payment.updateMany({
        where: {
          OR: [
            { providerPaymentId },
            {
              subscriptionId: tenant.subscriptionId || undefined,
              providerPaymentId: null,
            },
          ],
        },
        data: {
          providerPaymentId,
          status: paymentStatus as any,
          paidAt: payment.paidDate ? new Date(payment.paidDate) : undefined,
          dueDate: payment.dueDate ? new Date(payment.dueDate) : undefined,
          invoiceUrl: payment.invoiceUrl || undefined,
          bankSlipUrl: payment.bankSlipUrl || undefined,
          pixQrCode: payment.pixQrCode || undefined,
          rawPayload: payload,
        },
      });

      if (paymentStatus === "overdue") {
        const currentSubscription = await prisma.subscription.findUnique({
          where: { id: tenant.subscriptionId || "" },
          select: { status: true },
        });
        if (
          currentSubscription?.status !== "courtesy" &&
          currentSubscription?.status !== "canceled"
        ) {
          const overdueDueDate = payment.dueDate
            ? new Date(payment.dueDate)
            : tenant.dueDate;
          const gracePeriodEndsAt = calculateGracePeriodEndsAt(overdueDueDate);
          await prisma.subscription.updateMany({
            where: {
              id: tenant.subscriptionId || "",
              status: { notIn: ["courtesy", "canceled"] },
            },
            data: { status: "past_due", gracePeriodEndsAt },
          });
          await prisma.tenant.updateMany({
            where: {
              id: tenant.tenantId,
              status: { notIn: ["canceled", "blocked"] },
            },
            data: { status: "past_due" },
          });
          await logAudit({
            tenantId: tenant.tenantId,
            entityType: "billing",
            entityId: tenant.subscriptionId || providerPaymentId,
            action: "billing.grace_period_started",
            metadata: {
              providerPaymentId,
              dueDate:
                overdueDueDate?.toISOString?.() || payment.dueDate || null,
              gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
            },
          });
          await logAudit({
            tenantId: tenant.tenantId,
            entityType: "billing",
            entityId: tenant.subscriptionId || providerPaymentId,
            action: "billing.subscription_past_due",
            metadata: {
              providerPaymentId,
              gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
            },
          });
        }
      }

      if (paymentStatus === "refunded" || paymentStatus === "failed") {
        await prisma.subscription.updateMany({
          where: {
            id: tenant.subscriptionId || "",
            status: { not: "canceled" },
          },
          data: { status: "suspended" },
        });
        await prisma.tenant.updateMany({
          where: { id: tenant.tenantId, status: { not: "canceled" } },
          data: { status: "suspended" },
        });
        await prisma.allowedUser.updateMany({
          where: { tenantId: tenant.tenantId },
          data: { active: false, status: "inactive" },
        });
      }

      if (paymentStatus === "received") {
        const currentSubscription = await prisma.subscription.findUnique({
          where: { id: tenant.subscriptionId || "" },
          select: { status: true, plan: { select: { name: true } } },
        });
        const currentTenant = await prisma.tenant.findUnique({
          where: { id: tenant.tenantId },
          select: { status: true, name: true },
        });
        const access = evaluateBillingAccess({
          tenantStatus: currentTenant?.status,
          subscriptionStatus: currentSubscription?.status,
        });

        if (
          currentSubscription?.status !== "canceled" &&
          currentSubscription?.status !== "courtesy"
        ) {
          await prisma.subscription.updateMany({
            where: {
              id: tenant.subscriptionId || "",
              status: { notIn: ["canceled", "courtesy"] },
            },
            data: { status: "active", gracePeriodEndsAt: null },
          });
        }

        if (
          currentTenant?.status !== "canceled" &&
          currentTenant?.status !== "blocked"
        ) {
          await prisma.tenant.updateMany({
            where: {
              id: tenant.tenantId,
              status: { notIn: ["canceled", "blocked"] },
            },
            data: { status: "active" },
          });
          if (
            !access.allowAccess ||
            currentTenant?.status === "past_due" ||
            currentTenant?.status === "suspended"
          ) {
            await prisma.allowedUser.updateMany({
              where: { tenantId: tenant.tenantId },
              data: { active: true, status: "active", acceptedAt: new Date() },
            });
          }
        }

        await logAudit({
          tenantId: tenant.tenantId,
          entityType: "billing",
          entityId: providerPaymentId,
          action: "billing.payment_recovered",
          metadata: {
            event,
            previousTenantStatus: currentTenant?.status || null,
            previousSubscriptionStatus: currentSubscription?.status || null,
          },
        });
        await logAudit({
          tenantId: tenant.tenantId,
          entityType: "billing",
          entityId: providerPaymentId,
          action: "billing.checkout_payment_confirmed",
          metadata: {
            event,
            previousTenantStatus: currentTenant?.status || null,
            previousSubscriptionStatus: currentSubscription?.status || null,
          },
        });
        await logAudit({
          tenantId: tenant.tenantId,
          entityType: "billing",
          entityId: tenant.subscriptionId || providerPaymentId,
          action: "billing.subscription_reactivated",
          metadata: { event, providerPaymentId },
        });
        await logAudit({
          tenantId: tenant.tenantId,
          entityType: "billing",
          entityId: tenant.subscriptionId || providerPaymentId,
          action: "billing.checkout_access_released",
          metadata: { event, providerPaymentId },
        });

        const ownerAllowed = await prisma.allowedUser.findFirst({
          where: { tenantId: tenant.tenantId, active: true },
          orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        });
        if (ownerAllowed?.email) {
          try {
            const hasActiveToken = await hasRecentActiveFirstAccessToken({
              email: ownerAllowed.email,
              tenantId: tenant.tenantId,
            });
            const shouldSendActivationEmail = !hasActiveToken;
            let emailResult: { ok: boolean; reason?: string | null } = {
              ok: false,
              reason: "activation_email_already_sent_recently",
            };
            if (shouldSendActivationEmail) {
              const firstAccess = await createFirstAccessToken({
                email: ownerAllowed.email,
                tenantId: tenant.tenantId,
                userId: null,
              });
              emailResult = await sendTransactionalEmail({
                to: ownerAllowed.email,
                tenantId: tenant.tenantId,
                userId: null,
                template: "plan_activated",
                params: {
                  name: currentTenant?.name || "cliente",
                  planName: currentSubscription?.plan?.name || "Plano FlipForm",
                  email: ownerAllowed.email,
                  firstAccessUrl: firstAccess.url,
                  appLoginUrl: getAppLoginUrl(),
                },
              });
            }

            await logAudit({
              tenantId: tenant.tenantId,
              entityType: "email",
              entityId: ownerAllowed.email,
              action: "email.activation_send_attempted",
            });

            await logAudit({
              tenantId: tenant.tenantId,
              entityType: "email",
              entityId: ownerAllowed.email,
              action: emailResult.ok
                ? "email.activation_sent"
                : "email.activation_skipped_provider_missing",
              metadata: {
                skipped: !emailResult.ok,
                reason: (emailResult as any).reason || null,
              },
            });
          } catch (emailError) {
            console.error("[first-access.email]", {
              message:
                emailError instanceof Error
                  ? emailError.message
                  : String(emailError),
            });
            await logAudit({
              tenantId: tenant.tenantId,
              entityType: "email",
              entityId: ownerAllowed.email,
              action: "email.activation_failed",
            });
          }
        }
      }

      await logAudit({
        tenantId: tenant.tenantId,
        entityType: "billing",
        entityId: providerPaymentId,
        action: `billing.webhook.${event.toLowerCase()}`,
        metadata: { event, paymentStatus },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    captureServerException(error, {
      route: "/api/webhooks/asaas",
      method: "POST",
    });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
