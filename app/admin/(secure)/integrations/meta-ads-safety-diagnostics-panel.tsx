'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type TenantOption = { id: string; name: string; slug: string };
type DiagnosticsPayload = {
  tenant: { id: string; name: string; slug: string };
  binding: {
    adAccountId: string;
    adAccountName: string | null;
    pixelId: string;
    pixelName: string | null;
    connectedAt: string;
    lastValidatedAt: string | null;
  };
  diagnostics: {
    account: {
      id: string;
      name: string | null;
      accountStatus: number | null;
      disableReason: number | null;
      currency: string | null;
      timezoneName: string | null;
    };
    campaignSummary: {
      total: number;
      active: number;
      paused: number;
      archivedOrDeleted: number;
      other: number;
    };
    campaigns: Array<{
      id: string;
      name: string | null;
      status: string | null;
      effectiveStatus: string | null;
      updatedTime: string | null;
    }>;
    activityAvailable: boolean;
    activities: Array<{
      eventTime: string | null;
      eventType: string | null;
      actorName: string | null;
      objectName: string | null;
      objectId: string | null;
    }>;
  };
  readOnly: true;
};

async function getJson(url: string) {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'Falha ao consultar a Meta.');
  return payload;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR');
}

export function MetaAdsSafetyDiagnosticsPanel() {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<DiagnosticsPayload | null>(null);

  useEffect(() => {
    getJson('/api/admin/tenants')
      .then(data => setTenants((data.tenants || []).map((tenant: any) => ({ id: tenant.id, name: tenant.name, slug: tenant.slug }))))
      .catch(error => toast.error(error.message || 'Não foi possível carregar os tenants.'));
  }, []);

  async function diagnose() {
    if (!tenantId) {
      toast.error('Selecione um tenant primeiro.');
      return;
    }
    setLoading(true);
    setPayload(null);
    try {
      const data = await getJson(`/api/admin/integrations/meta/tenant-diagnostics?tenantId=${encodeURIComponent(tenantId)}`);
      setPayload(data);
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível executar o diagnóstico Meta.');
    } finally {
      setLoading(false);
    }
  }

  return <Card className="p-6 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold text-emerald-700">SEGURANÇA META ADS</p>
        <h2 className="font-heading text-xl font-semibold">Diagnóstico de campanhas — somente leitura</h2>
        <p className="text-sm text-muted-foreground">Consulta o estado real da conta e das campanhas usando apenas leitura da Marketing API.</p>
      </div>
      <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
        <ShieldCheck className="h-4 w-4" />
        Não pausa, ativa, edita ou exclui campanhas.
      </div>
    </div>

    <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="meta-diagnostics-tenant">Tenant</label>
        <select
          id="meta-diagnostics-tenant"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={tenantId}
          onChange={event => { setTenantId(event.target.value); setPayload(null); }}
        >
          <option value="">Selecione um tenant</option>
          {tenants.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.slug}</option>)}
        </select>
      </div>
      <Button type="button" onClick={diagnose} disabled={loading || !tenantId}>
        {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Consultando...</> : 'Diagnosticar conta Meta'}
      </Button>
    </div>

    {payload && <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border bg-slate-50 p-3">
          <p className="text-xs text-muted-foreground">Conta vinculada</p>
          <p className="text-sm font-medium">{payload.binding.adAccountName || payload.binding.adAccountId}</p>
          <p className="text-xs text-muted-foreground">{payload.binding.adAccountId}</p>
        </div>
        <div className="rounded-md border bg-slate-50 p-3">
          <p className="text-xs text-muted-foreground">Status da conta / motivo</p>
          <p className="text-sm font-medium">{payload.diagnostics.account.accountStatus ?? '—'} / {payload.diagnostics.account.disableReason ?? '—'}</p>
          <p className="text-xs text-muted-foreground">{payload.diagnostics.account.currency || '—'} · {payload.diagnostics.account.timezoneName || '—'}</p>
        </div>
        <div className="rounded-md border bg-slate-50 p-3">
          <p className="text-xs text-muted-foreground">Pixel / Dataset</p>
          <p className="text-sm font-medium">{payload.binding.pixelName || payload.binding.pixelId}</p>
          <p className="text-xs text-muted-foreground">{payload.binding.pixelId}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ['Total', payload.diagnostics.campaignSummary.total],
          ['Ativas', payload.diagnostics.campaignSummary.active],
          ['Pausadas', payload.diagnostics.campaignSummary.paused],
          ['Arquivadas/excluídas', payload.diagnostics.campaignSummary.archivedOrDeleted],
          ['Outros estados', payload.diagnostics.campaignSummary.other],
        ].map(([label, value]) => <div key={String(label)} className="rounded-md border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg font-semibold">{value}</p></div>)}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Campanhas retornadas pela Meta</h3>
        <div className="max-h-72 overflow-auto rounded-md border">
          {payload.diagnostics.campaigns.length === 0
            ? <p className="p-3 text-sm text-muted-foreground">Nenhuma campanha retornada.</p>
            : payload.diagnostics.campaigns.slice(0, 50).map(campaign => <div key={campaign.id} className="grid gap-1 border-b p-3 text-xs last:border-b-0 md:grid-cols-[1fr_130px_170px]">
              <div><p className="text-sm font-medium">{campaign.name || campaign.id}</p><p className="text-muted-foreground">{campaign.id}</p></div>
              <div><p>Status: {campaign.status || '—'}</p><p>Efetivo: {campaign.effectiveStatus || '—'}</p></div>
              <div className="text-muted-foreground">Atualizada: {formatDate(campaign.updatedTime)}</div>
            </div>)}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Atividade recente da conta</h3>
          {!payload.diagnostics.activityAvailable && <span className="flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />A Meta não liberou esta consulta.</span>}
        </div>
        <div className="max-h-72 overflow-auto rounded-md border">
          {!payload.diagnostics.activityAvailable
            ? <p className="p-3 text-sm text-muted-foreground">Use o Histórico de atividades do Ads Manager para conferir “Alterado por”, regra automática e horário da mudança.</p>
            : payload.diagnostics.activities.length === 0
              ? <p className="p-3 text-sm text-muted-foreground">Nenhuma atividade recente retornada pela Meta.</p>
              : payload.diagnostics.activities.slice(0, 50).map((activity, index) => <div key={`${activity.eventTime || 'event'}-${activity.objectId || index}`} className="grid gap-1 border-b p-3 text-xs last:border-b-0 md:grid-cols-[170px_1fr_200px]">
                <div>{formatDate(activity.eventTime)}</div>
                <div><p className="font-medium">{activity.eventType || 'Evento'}</p><p className="text-muted-foreground">{activity.objectName || activity.objectId || '—'}</p></div>
                <div>Alterado por: {activity.actorName || 'não informado'}</div>
              </div>)}
        </div>
      </div>
    </div>}
  </Card>;
}
