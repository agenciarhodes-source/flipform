'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CreditCard, Users, AlertCircle } from 'lucide-react';

export default function AdminBillingPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/plans').then((r) => r.json()),
      fetch('/api/admin/overview').then((r) => r.json()),
    ]).then(([p, o]) => { setPlans(p.plans || []); setOverview(o); setLoading(false); });
  }, []);

  if (loading) return <div className="p-8 text-muted-foreground"><Loader2 className="w-5 h-5 inline animate-spin mr-2" />Carregando...</div>;

  return (
    <div className="p-8 space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-bold">Billing & Planos</h1>
        <p className="text-sm text-muted-foreground">Gerenciamento de planos e preparação para Asaas.</p>
      </div>
      <Card className="p-5 bg-amber-50 border-amber-200">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
          <div>
            <div className="font-medium text-amber-900">Integração Asaas pendente</div>
            <div className="text-sm text-amber-800">O schema e as páginas estão prontos. Para ativar cobrança real, configure <code>ASAAS_API_KEY</code> e <code>ASAAS_WEBHOOK_SECRET</code> em <code>.env</code>.</div>
          </div>
        </div>
      </Card>
      <Card className="p-5">
        <div className="text-sm text-muted-foreground">MRR estimado</div>
        <div className="font-heading text-3xl font-bold">R$ {Number(overview?.mrr || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
      </Card>
      <div>
        <h2 className="font-heading font-semibold mb-3">Planos disponíveis</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((p) => (
            <Card key={p.id} className="p-5 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-heading font-bold text-lg">{p.name}</h3>
                <Badge variant={p.isActive ? 'default' : 'secondary'}>{p.isActive ? 'Ativo' : 'Inativo'}</Badge>
              </div>
              {p.description && <div className="text-xs text-muted-foreground mb-2">{p.description}</div>}
              <div className="font-heading text-3xl font-bold">R$ {Number(p.price).toFixed(2)}<span className="text-xs text-muted-foreground font-normal">/{p.billingCycle === 'yearly' ? 'ano' : 'mês'}</span></div>
              <ul className="text-xs text-muted-foreground mt-3 space-y-1">
                <li>{p.maxUsers} usuário{p.maxUsers !== 1 ? 's' : ''}</li>
                <li>{p.maxForms} formulário{p.maxForms !== 1 ? 's' : ''}</li>
                <li>{p.maxLeads.toLocaleString('pt-BR')} leads</li>
              </ul>
              <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" /> {p.tenantsCount} tenant{p.tenantsCount !== 1 ? 's' : ''}</span>
                <span className="inline-flex items-center gap-1"><CreditCard className="w-3 h-3" /> {p.subscriptionsCount} sub.</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
