import Link from "next/link";
import { PaymentStatus } from "@prisma/client";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Clock3,
  CreditCard,
  ExternalLink,
  FileText,
  Gift,
  QrCode,
  ShieldAlert,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import ChangePlanClient from "./change-plan-client";
import CancelSubscriptionClient from "./cancel-subscription-client";
import LgpdClient from "./lgpd-client";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const PAID_STATUSES = new Set(["confirmed", "received"]);
const PENDING_STATUSES: PaymentStatus[] = ["pending", "overdue"];

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function statusLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    active: "Ativa",
    trial: "Em teste",
    trialing: "Em teste",
    courtesy: "Cortesia",
    past_due: "Pagamento pendente",
    pending: "Pendente",
    overdue: "Vencida",
    suspended: "Suspensa",
    canceled: "Cancelada",
    unpaid: "Não paga",
    paused: "Pausada",
    confirmed: "Confirmado",
    received: "Recebido",
    refunded: "Reembolsado",
    failed: "Falhou",
    blocked: "Bloqueado",
    inactive: "Inativo",
  };
  const key = String(status || "").toLowerCase();
  return labels[key] || status || "—";
}

function statusVariant(status: string | null | undefined): BadgeVariant {
  const normalized = String(status || "").toLowerCase();
  if (["active", "trial", "trialing", "courtesy", "confirmed", "received"].includes(normalized)) {
    return "secondary";
  }
  if (["past_due", "pending", "overdue", "suspended", "canceled", "unpaid", "failed", "blocked", "inactive"].includes(normalized)) {
    return "destructive";
  }
  return "outline";
}

function daysUntil(date: Date | string | null | undefined) {
  if (!date) return null;
  const target = new Date(date).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((target - now) / (1000 * 60 * 60 * 24)));
}

function paymentUrl(payment: { invoiceUrl: string | null; bankSlipUrl: string | null }) {
  return payment.invoiceUrl || payment.bankSlipUrl || null;
}

export default async function BillingPage() {
  const session = await getSession();
  if (!session) return null;

  const [tenant, subscription, payments, pendingPayments] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: {
        id: true,
        name: true,
        status: true,
        nextDueDate: true,
        plan: true,
      },
    }),
    prisma.subscription.findFirst({
      where: { tenantId: session.tenantId },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.payment.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.payment.findMany({
      where: {
        tenantId: session.tenantId,
        status: { in: PENDING_STATUSES },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 10,
    }),
  ]);

  const currentPlan = subscription?.plan || tenant?.plan || null;
  const tenantStatus = String(tenant?.status || "").toLowerCase();
  const subscriptionStatus = String(subscription?.status || "").toLowerCase();
  const isCourtesy = subscriptionStatus === "courtesy";
  const isTrial = tenantStatus === "trial" || tenantStatus === "trialing" || subscriptionStatus === "trialing";
  const isPastDue = tenantStatus === "past_due" || subscriptionStatus === "past_due";
  const isBlocked = ["suspended", "canceled", "blocked", "inactive"].includes(tenantStatus) || ["suspended", "canceled"].includes(subscriptionStatus);
  const graceDays = daysUntil(subscription?.gracePeriodEndsAt);
  const nextDueDate = subscription?.nextDueDate || tenant?.nextDueDate || null;
  const lastPaidPayment = payments.find((payment) => PAID_STATUSES.has(payment.status));
  const lastPayment = lastPaidPayment || payments[0] || null;
  const firstPayablePendingPayment = pendingPayments.find((payment) => paymentUrl(payment));
  const payNowUrl = firstPayablePendingPayment ? paymentUrl(firstPayablePendingPayment) : null;

  return (
    <div className="p-4 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Portal financeiro</p>
          <h1 className="font-heading text-2xl lg:text-3xl font-bold">Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe seu plano, assinatura, cobranças e links de pagamento.
          </p>
        </div>
        {payNowUrl && (isPastDue || isBlocked) && (
          <Button asChild>
            <Link href={payNowUrl} target="_blank" rel="noreferrer">
              Pagar agora <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>

      {isCourtesy && (
        <Card className="border-emerald-200 bg-emerald-50/80 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 text-emerald-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <Gift className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <div className="font-semibold">Cortesia ativa</div>
                <p className="text-sm text-emerald-800">
                  Não há cobrança obrigatória para esta empresa enquanto a cortesia estiver ativa.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isTrial && !isCourtesy && (
        <Card className="border-blue-200 bg-blue-50/80 shadow-sm">
          <CardContent className="flex gap-3 p-4 text-blue-900">
            <Clock3 className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <div className="font-semibold">Período experimental</div>
              <p className="text-sm text-blue-800">
                Sua empresa está em teste{subscription?.currentPeriodEnd ? ` até ${formatDate(subscription.currentPeriodEnd)}` : ""}. O plano vinculado é {currentPlan?.name || "—"}.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isPastDue && !isBlocked && !isCourtesy && (
        <Card className="border-amber-200 bg-amber-50/80 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <div className="font-semibold">Pendência financeira</div>
                <p className="text-sm text-amber-900">
                  Regularize a cobrança pendente para evitar suspensão{subscription?.gracePeriodEndsAt ? ` até ${formatDate(subscription.gracePeriodEndsAt)}` : ""}.
                  {graceDays !== null ? ` Prazo restante: ${graceDays} dia${graceDays === 1 ? "" : "s"}.` : ""}
                </p>
              </div>
            </div>
            {payNowUrl && (
              <Button asChild className="shrink-0">
                <Link href={payNowUrl} target="_blank" rel="noreferrer">
                  Pagar agora <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {isBlocked && !isCourtesy && (
        <Card className="border-destructive/30 bg-destructive/5 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 text-destructive sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <div className="font-semibold">Acesso bloqueado</div>
                <p className="text-sm text-destructive/90">
                  Motivo: {tenantStatus === "canceled" || subscriptionStatus === "canceled" ? "assinatura cancelada" : "pendência financeira ou suspensão administrativa"}.
                  {subscription?.gracePeriodEndsAt ? ` O prazo de regularização terminou em ${formatDate(subscription.gracePeriodEndsAt)}.` : ""}
                </p>
              </div>
            </div>
            {payNowUrl && (
              <Button asChild className="shrink-0">
                <Link href={payNowUrl} target="_blank" rel="noreferrer">
                  Regularizar pagamento <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CreditCard className="h-4 w-4" /> Plano atual
            </div>
            <CardTitle>{currentPlan?.name || "Plano não definido"}</CardTitle>
            <CardDescription>{currentPlan?.description || "Confira os detalhes do plano vinculado ao seu tenant."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Valor</span>
              <span className="font-medium">{currentPlan ? formatMoney(currentPlan.price) : "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Ciclo</span>
              <span className="font-medium">{currentPlan?.billingCycle === "yearly" ? "Anual" : currentPlan?.billingCycle === "monthly" ? "Mensal" : "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" /> Status da assinatura
            </div>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant(subscription?.status)}>{statusLabel(subscription?.status)}</Badge>
            </CardTitle>
            <CardDescription>Status financeiro da assinatura mais recente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Status do tenant</span>
              <Badge variant={statusVariant(tenant?.status)}>{statusLabel(tenant?.status)}</Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Grace period</span>
              <span className="font-medium">{formatDate(subscription?.gracePeriodEndsAt)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock className="h-4 w-4" /> Próxima cobrança
            </div>
            <CardTitle>{formatDate(nextDueDate)}</CardTitle>
            <CardDescription>
              {isCourtesy ? "Sem cobrança obrigatória na cortesia." : "Data prevista da próxima cobrança, quando disponível."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Último pagamento</span>
              <span className="font-medium">{lastPayment ? `${formatMoney(lastPayment.value)} · ${statusLabel(lastPayment.status)}` : "—"}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {lastPayment?.paidAt ? `Pago em ${formatDate(lastPayment.paidAt)}` : lastPayment ? `Criado em ${formatDate(lastPayment.createdAt)}` : "Nenhum pagamento encontrado."}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Banknote className="h-4 w-4" /> Cobranças pendentes
            </div>
            <CardTitle>Pendências financeiras</CardTitle>
            <CardDescription>Links de pagamento aparecem somente quando retornados pelo provedor.</CardDescription>
          </CardHeader>
          <CardContent>
            {pendingPayments.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma pendência financeira no momento.</p>
            ) : (
              <div className="space-y-3">
                {pendingPayments.map((payment) => (
                  <div key={payment.id} className="rounded-lg border p-4 text-sm">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={statusVariant(payment.status)}>{statusLabel(payment.status)}</Badge>
                          <span className="font-semibold">{formatMoney(payment.value)}</span>
                        </div>
                        <div className="text-muted-foreground">Vencimento: {formatDate(payment.dueDate)}</div>
                        <div className="text-muted-foreground">Tipo: {payment.billingType || "—"}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {payment.invoiceUrl && (
                          <Button asChild size="sm" variant="outline">
                            <Link href={payment.invoiceUrl} target="_blank" rel="noreferrer">
                              Fatura <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        )}
                        {payment.bankSlipUrl && (
                          <Button asChild size="sm" variant="outline">
                            <Link href={payment.bankSlipUrl} target="_blank" rel="noreferrer">
                              Boleto <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                    {payment.pixQrCode && (
                      <div className="mt-3 rounded-md bg-muted p-3">
                        <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          <QrCode className="h-3.5 w-3.5" /> Pix QR Code
                        </div>
                        <p className="break-all text-xs text-foreground/80">{payment.pixQrCode}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" /> Pagamentos recentes
            </div>
            <CardTitle>Histórico</CardTitle>
            <CardDescription>Últimos registros financeiros do seu tenant.</CardDescription>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhum pagamento encontrado.</p>
            ) : (
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div key={payment.id} className="flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={statusVariant(payment.status)}>{statusLabel(payment.status)}</Badge>
                        <span className="font-semibold">{formatMoney(payment.value)}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Vencimento: {formatDate(payment.dueDate)} · Pagamento: {formatDate(payment.paidAt)}
                      </div>
                    </div>
                    {paymentUrl(payment) && (
                      <Button asChild size="sm" variant="ghost">
                        <Link href={paymentUrl(payment) || "#"} target="_blank" rel="noreferrer">
                          Abrir link <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {!isBlocked && (
        <div className="grid gap-4 lg:grid-cols-3">
          <ChangePlanClient currentPlan={currentPlan?.slug || null} />
          <CancelSubscriptionClient />
          <LgpdClient />
        </div>
      )}
    </div>
  );
}
