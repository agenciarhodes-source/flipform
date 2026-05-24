import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import ChangePlanClient from './change-plan-client';
import CancelSubscriptionClient from './cancel-subscription-client';
import LgpdClient from './lgpd-client';
import { Badge } from '@/components/ui/badge';

function variantForStatus(status: string | null | undefined): 'outline' | 'secondary' {
  const s = String(status || '').toLowerCase();
  return s === 'active' || s === 'trialing' ? 'secondary' : 'outline';
}

export default async function BillingPage() {
  const session = await getSession();
  if (!session) return null;
  const sub = await prisma.subscription.findFirst({ where: { tenantId: session.tenantId }, include: { plan: true }, orderBy: { createdAt: 'desc' } });
  const payments = await prisma.payment.findMany({ where: { tenantId: session.tenantId }, orderBy: { createdAt: 'desc' }, take: 10 });

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Billing</h1>
      <div className="rounded border p-4">
        <div>Plano: {sub?.plan?.name || '—'}</div>
        <div className="flex items-center gap-2">Status: <Badge variant={variantForStatus(sub?.status)}>{sub?.status || '—'}</Badge></div>
        <div>Próxima cobrança: {sub?.nextDueDate ? new Date(sub.nextDueDate).toLocaleDateString('pt-BR') : '—'}</div>
      </div>
      <ChangePlanClient currentPlan={sub?.plan?.slug || null} />
      <CancelSubscriptionClient />
      <LgpdClient />
      <CancelSubscriptionClient />
      <LgpdClient />
      <div className="rounded border p-4">
        <h2 className="font-medium mb-2">Últimas cobranças</h2>
        <ul className="space-y-1 text-sm">{payments.map((p) => <li key={p.id}>{p.status} - R$ {Number(p.value).toFixed(2)} {p.invoiceUrl ? <a href={p.invoiceUrl} className="underline" target="_blank">pagar</a> : ''}</li>)}</ul>
      </div>
    </div>
  );
}
