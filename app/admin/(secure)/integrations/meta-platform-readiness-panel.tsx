'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDotDashed, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type ReadinessCheck = {
  key: string;
  label: string;
  status: 'pass' | 'fail' | 'manual';
  detail: string;
  blocking: boolean;
};

type ReadinessComponent = {
  key: string;
  label: string;
  status: 'ready' | 'action_required';
  summary: string;
  checks: ReadinessCheck[];
};

type MetaPlatformReadiness = {
  status: 'ready_for_external_validation' | 'action_required';
  summary: string;
  graphApiVersions: { meta: string; instagram: string };
  endpoints: {
    adsOAuthCallback: string;
    instagramOAuthCallback: string;
    instagramWebhook: string;
    whatsappWebhook: string;
  };
  components: ReadinessComponent[];
  releaseGates: Array<{
    key: string;
    label: string;
    status: 'manual';
    detail: string;
  }>;
  generatedAt: string;
};

function CheckIcon({ status }: { status: ReadinessCheck['status'] }) {
  if (status === 'pass') return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />;
  if (status === 'fail') return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />;
  return <CircleDotDashed className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />;
}

export function MetaPlatformReadinessPanel() {
  const [readiness, setReadiness] = useState<MetaPlatformReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/integrations/meta/readiness', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível validar a prontidão da Meta.');
      setReadiness(payload.readiness || null);
    } catch (loadError: any) {
      setError(loadError.message || 'Não foi possível validar a prontidão da Meta.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <Card className="p-6 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-blue-600" aria-hidden="true" />
          <p className="text-xs font-semibold text-blue-600">META PLATFORM READINESS</p>
        </div>
        <h2 className="font-heading text-xl font-semibold">Saúde da configuração universal</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Diagnóstico somente leitura da infraestrutura Meta. Nenhum Tenant, Lead, Kanban ou histórico de cliente é alterado por esta verificação.
        </p>
      </div>
      <div className="flex items-center gap-2">
        {readiness && <Badge variant={readiness.status === 'ready_for_external_validation' ? 'secondary' : 'outline'}>
          {readiness.status === 'ready_for_external_validation' ? 'Internamente pronto' : 'Ação necessária'}
        </Badge>}
        <Button type="button" variant="outline" size="sm" onClick={() => void load(true)} disabled={loading || refreshing}>
          {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Revalidar
        </Button>
      </div>
    </div>

    {loading && <div className="rounded-md border p-4 text-sm text-muted-foreground">
      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Validando configuração local da plataforma...
    </div>}

    {error && <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</div>}

    {readiness && <>
      <div className={`rounded-md border p-4 text-sm ${readiness.status === 'ready_for_external_validation' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
        <p className="font-medium">{readiness.status === 'ready_for_external_validation' ? 'Configuração interna pronta para validação externa' : 'Existem pendências internas antes do rollout'}</p>
        <p className="mt-1 text-xs opacity-90">{readiness.summary}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {readiness.components.map(item => <div key={item.key} className="rounded-lg border bg-white p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">{item.label}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{item.summary}</p>
            </div>
            <Badge variant={item.status === 'ready' ? 'secondary' : 'outline'}>{item.status === 'ready' ? 'Pronto' : 'Pendente'}</Badge>
          </div>
          <div className="space-y-2">
            {item.checks.map(check => <div key={check.key} className="flex gap-2 rounded-md bg-slate-50 p-2.5">
              <CheckIcon status={check.status} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium">{check.label}</p>
                  {check.blocking && check.status === 'fail' && <span className="text-[10px] font-medium uppercase tracking-wide text-amber-700">bloqueante</span>}
                </div>
                <p className="mt-0.5 break-words text-[11px] text-muted-foreground">{check.detail}</p>
              </div>
            </div>)}
          </div>
        </div>)}
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Gates externos da Meta</h3>
          <p className="mt-1 text-xs text-muted-foreground">Estes itens não são inferidos pelo FlipForm. Precisam ser confirmados no painel da Meta antes da liberação comercial ampla.</p>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {readiness.releaseGates.map(gate => <div key={gate.key} className="rounded-md border border-blue-200 bg-blue-50 p-3">
            <div className="flex items-center gap-2 text-blue-900">
              <CircleDotDashed className="h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="text-xs font-medium">{gate.label}</p>
            </div>
            <p className="mt-1.5 text-[11px] text-blue-800">{gate.detail}</p>
          </div>)}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border bg-slate-50 p-3">
          <p className="text-xs font-medium">Versões da Graph API em uso</p>
          <p className="mt-1 text-xs text-muted-foreground">Meta/WhatsApp: {readiness.graphApiVersions.meta} · Instagram: {readiness.graphApiVersions.instagram}</p>
        </div>
        <div className="rounded-lg border bg-slate-50 p-3">
          <p className="text-xs font-medium">Última leitura</p>
          <p className="mt-1 text-xs text-muted-foreground">{new Date(readiness.generatedAt).toLocaleString('pt-BR')}</p>
        </div>
      </div>

      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-medium">Endpoints técnicos cadastráveis na Meta</summary>
        <div className="mt-3 space-y-2 text-xs text-muted-foreground">
          <p className="break-all"><strong>Ads OAuth:</strong> {readiness.endpoints.adsOAuthCallback}</p>
          <p className="break-all"><strong>Instagram OAuth:</strong> {readiness.endpoints.instagramOAuthCallback}</p>
          <p className="break-all"><strong>Instagram Webhook:</strong> {readiness.endpoints.instagramWebhook}</p>
          <p className="break-all"><strong>WhatsApp Webhook:</strong> {readiness.endpoints.whatsappWebhook}</p>
        </div>
      </details>
    </>}
  </Card>;
}
