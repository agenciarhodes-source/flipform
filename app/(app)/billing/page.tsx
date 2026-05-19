import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import ChangePlanClient from './change-plan-client';
import { Badge } from '@/components/ui/badge';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

function variantForStatus(status: string | null | undefined): BadgeVariant {
  const normalized = String(status || '').toLowerCase();

  if (['active', 'paid', 'received', 'confirmed', 'courtesy'].includes(normalized)) return 'secondary';
  if (['overdue', 'past_due', 'failed', 'canceled', 'cancelled', 'suspended', 'blocked'].includes(normalized)) return 'destructive';
  if (['pending', 'trialing', 'processing'].includes(normalized)) return 'outline';

  return 'outline';
}

export default async function BillingPage() {
  const session = await getSession();
  if (!session) return null;

  const [tenant, sub, payments] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { status: true } }),
    prisma.subscription.findFirst({ where: { tenantId: session.tenantId }, include: { plan: true }, orderBy: { createdAt: 'desc' } }),
    prisma.payment.findMany({ where: { tenantId: session.tenantId }, orderBy: { createdAt: 'desc' }, take: 10 }),
  ]);

  const courtesy = sub?.status === 'courtesy';

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Billing</h1>
      <div className="rounded border p-4 space-y-2">
        <div>Plano: {sub?.plan?.name || '—'}</div>
        <div className="flex items-center gap-2">Status da assinatura: <Badge variant={variantForStatus(sub?.status)}>{sub?.status || '—'}</Badge></div>
        <div className="flex items-center gap-2">Status do tenant: <Badge variant={variantForStatus(tenant?.status)}>{tenant?.status || '—'}</Badge></div>
        <div className="flex items-center gap-2">Conta cortesia: <Badge variant={courtesy ? 'secondary' : 'outline'}>{courtesy ? 'Sim' : 'Não'}</Badge></div>
        <div>Próxima cobrança: {sub?.nextDueDate ? new Date(sub.nextDueDate).toLocaleDateString('pt-BR') : '—'}</div>
      </div>
      <ChangePlanClient currentPlan={sub?.plan?.slug || null} />
      <div className="rounded border p-4">
        <h2 className="font-medium mb-2">Últimas cobranças</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma cobrança encontrada.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {payments.map((p) => (
              <li key={p.id}>
                <Badge variant={variantForStatus(p.status)}>{p.status}</Badge> - R$ {Number(p.value).toFixed(2)}{' '}
                {p.invoiceUrl ? <a href={p.invoiceUrl} className="underline" target="_blank" rel="noreferrer">ver fatura</a> : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
