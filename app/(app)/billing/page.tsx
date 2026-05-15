import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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
        <div>Status: {sub?.status || '—'}</div>
        <div>Próxima cobrança: {sub?.nextDueDate ? new Date(sub.nextDueDate).toLocaleDateString('pt-BR') : '—'}</div>
      </div>
      <div className="rounded border p-4">
        <h2 className="font-medium mb-2">Últimas cobranças</h2>
        <ul className="space-y-1 text-sm">{payments.map((p) => <li key={p.id}>{p.status} - R$ {Number(p.value).toFixed(2)} {p.invoiceUrl ? <a href={p.invoiceUrl} className="underline" target="_blank">pagar</a> : ''}</li>)}</ul>
      </div>
    </div>
  );
}
