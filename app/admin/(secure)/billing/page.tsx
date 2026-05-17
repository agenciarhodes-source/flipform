'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, RefreshCcw } from 'lucide-react';

type DiagnosticRow = {
  subscriptionId: string;
  tenantName: string;
  tenantId: string;
  tenantStatus: string;
  subscriptionStatus: string;
  courtesy: boolean;
  asaasCustomerId: string | null;
  asaasSubscriptionId: string | null;
  nextDueDate: string | null;
  lastPaymentStatus: string | null;
  lastWebhookEvent: string | null;
  lastWebhookAt: string | null;
  updatedAt: string;
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  past_due: 'secondary',
  suspended: 'destructive',
  canceled: 'outline',
  courtesy: 'secondary',
};

export default function AdminBillingPage() {
  const [rows, setRows] = useState<DiagnosticRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncingBySub, setSyncingBySub] = useState<Record<string, boolean>>({});

  async function load() {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch('/api/admin/billing/diagnostics', { cache: 'no-store' });
      if (!res.ok) throw new Error('Falha ao carregar diagnóstico');
      const data = await res.json();
      setRows(data.rows || []);
    } catch {
      setError('Não foi possível carregar os dados de billing.');
    } finally {
      setLoading(false);
    }
  }


  async function syncBillingStatus(row: DiagnosticRow) {
    if (!row.asaasSubscriptionId) return;
    setSyncingBySub((prev) => ({ ...prev, [row.subscriptionId]: true }));
    try {
      const res = await fetch(`/api/admin/tenants/${row.tenantId}/billing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_subscription' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Falha ao sincronizar');
      await load();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Não foi possível sincronizar o billing.';
      setError(message);
    } finally {
      setSyncingBySub((prev) => ({ ...prev, [row.subscriptionId]: false }));
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <div className="p-8 text-muted-foreground"><Loader2 className="w-5 h-5 inline animate-spin mr-2" />Carregando diagnóstico...</div>;

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Billing Diagnostics</h1>
          <p className="text-sm text-muted-foreground">Visão operacional de status de billing por tenant.</p>
        </div>
        <Button variant="outline" onClick={load} className="inline-flex items-center gap-2"><RefreshCcw className="w-4 h-4" />Atualizar</Button>
      </div>

      {error && (
        <Card className="p-5 bg-rose-50 border-rose-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5" />
            <div className="text-sm text-rose-800">{error}</div>
          </div>
        </Card>
      )}

      {!error && rows.length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground">Nenhuma assinatura encontrada para diagnóstico.</Card>
      )}

      {!error && rows.length > 0 && (
        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-3">Tenant</th>
                <th className="p-3">Tenant ID</th>
                <th className="p-3">Subscription</th>
                <th className="p-3">Billing</th>
                <th className="p-3">Courtesy</th>
                <th className="p-3">Asaas Customer</th>
                <th className="p-3">Asaas Subscription</th>
                <th className="p-3">Próx. venc.</th>
                <th className="p-3">Último pagamento</th>
                <th className="p-3">Último webhook</th>
                <th className="p-3">Atualizado em</th>
                <th className="p-3">Ação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.subscriptionId} className="border-t align-top">
                  <td className="p-3 font-medium">{r.tenantName}</td>
                  <td className="p-3 font-mono text-xs">{r.tenantId}</td>
                  <td className="p-3"><Badge variant={STATUS_VARIANT[r.subscriptionStatus] || 'outline'}>{r.subscriptionStatus}</Badge></td>
                  <td className="p-3"><Badge variant={STATUS_VARIANT[r.tenantStatus] || 'outline'}>{r.tenantStatus}</Badge></td>
                  <td className="p-3">{r.courtesy ? <Badge variant="secondary">Sim</Badge> : 'Não'}</td>
                  <td className="p-3 font-mono text-xs">{r.asaasCustomerId || '—'}</td>
                  <td className="p-3 font-mono text-xs">{r.asaasSubscriptionId || '—'}</td>
                  <td className="p-3">{r.nextDueDate ? new Date(r.nextDueDate).toLocaleDateString('pt-BR') : '—'}</td>
                  <td className="p-3">{r.lastPaymentStatus || '—'}</td>
                  <td className="p-3">{r.lastWebhookEvent ? `${r.lastWebhookEvent}${r.lastWebhookAt ? ` (${new Date(r.lastWebhookAt).toLocaleString('pt-BR')})` : ''}` : '—'}</td>
                  <td className="p-3">{new Date(r.updatedAt).toLocaleString('pt-BR')}</td>
                  <td className="p-3">
                    {r.asaasSubscriptionId ? (
                      <Button size="sm" variant="outline" onClick={() => syncBillingStatus(r)} disabled={Boolean(syncingBySub[r.subscriptionId])}>
                        {syncingBySub[r.subscriptionId] ? 'Sincronizando...' : 'Sync billing status'}
                      </Button>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
