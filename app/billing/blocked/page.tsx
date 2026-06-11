import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { requireBillingAccess } from "@/lib/billing-access";

function reasonLabel(reason: string) {
  if (reason === "suspended" || reason === "past_due_expired")
    return "Prazo de regularização expirado.";
  if (reason === "canceled") return "Assinatura cancelada.";
  if (reason === "blocked") return "Tenant bloqueado.";
  return "Pendência financeira na assinatura.";
}

export default async function BillingBlockedPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const access = await requireBillingAccess(session);
  const paymentUrl =
    access.payment?.invoiceUrl || access.payment?.bankSlipUrl || null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="max-w-lg bg-card border rounded-lg p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-2">
          Status atual: {access.tenant?.status || access.reason}
        </p>
        <h1 className="font-heading text-2xl font-bold mb-2">
          Acesso temporariamente bloqueado
        </h1>
        <p className="text-sm text-muted-foreground mb-3">
          {reasonLabel(access.reason)}
        </p>
        <p className="text-sm text-muted-foreground mb-5">
          Identificamos uma pendência financeira na assinatura da sua empresa.
          Seu acesso será reativado automaticamente após confirmação do
          pagamento.
        </p>
        <div className="flex flex-col items-center gap-3">
          {paymentUrl && (
            <Link
              href={paymentUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Regularizar pagamento
            </Link>
          )}
          <Link
            href="/api/auth/logout"
            prefetch={false}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Sair da conta
          </Link>
        </div>
      </div>
    </div>
  );
}
