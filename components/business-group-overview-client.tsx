'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ExternalLink, Loader2, Printer, RefreshCcw, Users, TrendingUp, CircleDollarSign, Target, Trophy, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DashboardMetricPicker } from '@/components/dashboard-metric-picker';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function formatMoney(cents: number) {
  return money.format((cents || 0) / 100);
}

const DEFAULT_GROUP_METRICS = ['leads', 'inProgress', 'won', 'lost', 'purchases', 'customers', 'conversion', 'revenue'];

type Overview = {
  period: 'today' | '7d' | '30d' | 'custom';
  group: { id: string; name: string; slug: string; role: string };
  selectedTenantId: string | null;
  scopeLabel: string;
  groupOptions: Array<{ id: string; name: string; role: string }>;
  tenantOptions: Array<{ id: string; name: string; slug: string; status: string; accessAllowed: boolean; accessReason: string }>;
  summary: {
    totalLeads: number;
    inProgress: number;
    won: number;
    lost: number;
    conversionRate: number;
    purchases: number;
    buyingCustomers: number;
    revenueCents: number;
    companies: number;
    teamMembers: number;
    agents: number;
  };
  funnelStages: Array<{ key: string; name: string; color: string; count: number; orderIndex: number; percentage: number }>;
  tenantPerformance: Array<{
    tenantId: string;
    name: string;
    slug: string;
    status: string;
    accessAllowed: boolean;
    accessReason: string;
    leads: number;
    inProgress: number;
    won: number;
    lost: number;
    conversionRate: number;
    purchases: number;
    buyingCustomers: number;
    revenueCents: number;
    teamMembers: number;
    agents: number;
  }>;
};

export function BusinessGroupOverviewClient() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [period, setPeriod] = useState<'today' | '7d' | '30d' | 'custom'>('30d');
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const [endDate, setEndDate] = useState(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const [groupId, setGroupId] = useState('');
  const [tenantId, setTenantId] = useState('all');
  const [loading, setLoading] = useState(true);
  const [switchingTenantId, setSwitchingTenantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedMetricKeys, setSelectedMetricKeys] = useState<string[]>(DEFAULT_GROUP_METRICS);
  const [metricPreferencesReady, setMetricPreferencesReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('flipform-group-dashboard-metrics-v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setSelectedMetricKeys(parsed.filter((item) => typeof item === 'string').slice(0, 8));
      }
    } catch {}
    setMetricPreferencesReady(true);
  }, []);

  useEffect(() => {
    if (!metricPreferencesReady) return;
    try { window.localStorage.setItem('flipform-group-dashboard-metrics-v1', JSON.stringify(selectedMetricKeys.slice(0, 8))); } catch {}
  }, [selectedMetricKeys, metricPreferencesReady]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period });
      if (period === 'custom') {
        params.set('startDate', startDate);
        params.set('endDate', endDate);
      }
      if (groupId) params.set('groupId', groupId);
      if (tenantId !== 'all') params.set('tenantId', tenantId);
      const response = await fetch(`/api/business-groups/overview?${params.toString()}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao carregar dashboard do grupo.');
      setOverview(data);
      if (!groupId) setGroupId(data.group.id);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar dashboard do grupo.');
    } finally {
      setLoading(false);
    }
  }, [period, startDate, endDate, groupId, tenantId]);

  useEffect(() => { load(); }, [load]);

  const currentTenant = useMemo(
    () => overview?.tenantOptions.find((tenant) => tenant.id === tenantId) || null,
    [overview, tenantId],
  );

  const performanceRows = useMemo(() => {
    if (!overview) return [];
    if (!overview.selectedTenantId) return overview.tenantPerformance;
    return overview.tenantPerformance.filter((tenant) => tenant.tenantId === overview.selectedTenantId);
  }, [overview]);

  async function openTenant(targetTenantId: string) {
    if (!overview?.group.id) return;
    setSwitchingTenantId(targetTenantId);
    setError(null);
    try {
      const response = await fetch('/api/business-groups/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: overview.group.id, tenantId: targetTenantId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível abrir esta unidade.');
      router.push('/dashboard');
      router.refresh();
    } catch (e: any) {
      setError(e.message || 'Não foi possível abrir esta unidade.');
    } finally {
      setSwitchingTenantId(null);
    }
  }

  const cards = overview ? [
    { key: 'leads', label: 'Novos leads', value: overview.summary.totalLeads, icon: Users },
    { key: 'inProgress', label: 'Em andamento', value: overview.summary.inProgress, icon: TrendingUp },
    { key: 'won', label: 'Fechados', value: overview.summary.won, icon: Trophy },
    { key: 'lost', label: 'Perdidos', value: overview.summary.lost, icon: XCircle },
    { key: 'purchases', label: 'Compras', value: overview.summary.purchases, icon: CircleDollarSign },
    { key: 'customers', label: 'Clientes', value: overview.summary.buyingCustomers, icon: Users },
    { key: 'conversion', label: 'Conversão', value: `${overview.summary.conversionRate}%`, icon: Target },
    { key: 'revenue', label: 'Receita', value: formatMoney(overview.summary.revenueCents), icon: CircleDollarSign },
    ...overview.funnelStages.map((stage) => ({ key: `stage:${stage.key}`, label: stage.name, value: stage.count, icon: Target })),
  ] : [];
  const selectedCards = selectedMetricKeys.map((key) => cards.find((card) => card.key === key)).filter(Boolean) as typeof cards;

  return (
    <div className="group-dashboard-print-page p-4 lg:p-8 space-y-6">
      <style jsx global>{`
        @media print {
          body:has(.group-dashboard-print-page) aside,
          body:has(.group-dashboard-print-page) header,
          body:has(.group-dashboard-print-page) .group-dashboard-print-hide,
          body:has(.group-dashboard-print-page) .dashboard-metric-picker { display: none !important; }
          body:has(.group-dashboard-print-page) aside + div { padding-left: 0 !important; }
          body:has(.group-dashboard-print-page) main { overflow: visible !important; }
          body:has(.group-dashboard-print-page) .group-dashboard-print-page { padding: 0 !important; }
        }
      `}</style>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-brand-600" />
            <h1 className="font-heading text-2xl lg:text-3xl font-bold">Dashboard do grupo</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Acompanhe toda a operação ou selecione uma empresa para ver seus resultados isoladamente.</p>
        </div>
        <div className="group-dashboard-print-hide flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" />Imprimir / Salvar PDF</Button>
          {overview && overview.groupOptions.length > 1 && (
            <Select value={groupId || overview.group.id} onValueChange={(value) => { setGroupId(value); setTenantId('all'); }}>
              <SelectTrigger className="w-[210px]"><SelectValue placeholder="Grupo" /></SelectTrigger>
              <SelectContent>
                {overview.groupOptions.map((group) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={tenantId} onValueChange={setTenantId}>
            <SelectTrigger className="w-[230px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda a operação</SelectItem>
              {overview?.tenantOptions.map((tenant) => (
                <SelectItem key={tenant.id} value={tenant.id} disabled={!tenant.accessAllowed}>
                  {tenant.name}{tenant.accessAllowed ? '' : ' — indisponível'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={(value) => setPeriod(value as 'today' | '7d' | '30d' | 'custom')}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="7d">7 dias</SelectItem>
              <SelectItem value="30d">30 dias</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
          {period === 'custom' && (
            <>
              <label className="text-xs text-muted-foreground">
                <span className="sr-only">Data inicial</span>
                <input aria-label="Data inicial" type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm text-foreground" />
              </label>
              <label className="text-xs text-muted-foreground">
                <span className="sr-only">Data final</span>
                <input aria-label="Data final" type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm text-foreground" />
              </label>
            </>
          )}
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </div>
      </div>

      {error && <Card className="p-4 border-rose-200 bg-rose-50 text-rose-800 text-sm">{error}</Card>}

      {loading && !overview ? (
        <div className="py-16 flex justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" />Carregando dashboard consolidado...</div>
      ) : overview ? (
        <>
          <Card className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Visão atual</div>
              <div className="font-heading font-semibold text-lg">{overview.scopeLabel}</div>
              <div className="text-xs text-muted-foreground mt-1">{overview.summary.companies} empresa(s) · {overview.summary.agents} atendente(s)</div>
            </div>
            {currentTenant?.accessAllowed && (
              <Button className="group-dashboard-print-hide" onClick={() => openTenant(currentTenant.id)} disabled={switchingTenantId === currentTenant.id}>
                {switchingTenantId === currentTenant.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                Abrir esta unidade
              </Button>
            )}
          </Card>

          <DashboardMetricPicker
            options={cards.map((card) => ({ key: card.key, label: card.label, description: card.key.startsWith('stage:') ? 'Etapa cadastrada nos funis do grupo.' : 'Indicador consolidado do grupo.' }))}
            selected={selectedMetricKeys}
            onChange={setSelectedMetricKeys}
            defaults={DEFAULT_GROUP_METRICS}
            max={8}
          />

          <div>
            <div className="mb-2"><h2 className="font-heading font-semibold">Métricas da visão atual</h2><p className="text-xs text-muted-foreground">Até 8 blocos personalizados para toda a operação ou para a unidade selecionada.</p></div>
            {selectedCards.length ? <div className="grid grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8 gap-3">
              {selectedCards.map((card) => {
                const Icon = card.icon;
                return <Card key={card.key} className="p-4"><div className="flex items-center justify-between gap-2"><div><div className="text-xs text-muted-foreground">{card.label}</div><div className="font-heading text-xl lg:text-2xl font-bold mt-1">{card.value}</div></div><Icon className="w-5 h-5 text-muted-foreground" /></div></Card>;
              })}
            </div> : <Card className="border-dashed p-5 text-center text-sm text-muted-foreground">Use “Personalizar métricas” para adicionar blocos à visão atual.</Card>}
          </div>

          <Card className="p-4">
            <div className="mb-3">
              <h2 className="font-heading font-semibold">Etapas do funil</h2>
              <p className="text-xs text-muted-foreground mt-0.5">As etapas usam os nomes cadastrados nos pipelines. Na visão consolidada, etapas com o mesmo nome são somadas e nomes diferentes permanecem separados.</p>
            </div>
            {overview.funnelStages.length ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
                {overview.funnelStages.map((stage) => (
                  <div key={stage.key} className="relative min-h-[98px] overflow-hidden rounded-xl border bg-card p-3">
                    <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: stage.color }} />
                    <div className="pt-1">
                      <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" title={stage.name}>{stage.name}</div>
                      <div className="mt-2 font-heading text-2xl font-bold">{stage.count}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{stage.percentage}% dos leads</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma etapa com leads no período selecionado.</div>}
          </Card>

          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b">
              <h2 className="font-heading font-semibold">Performance por empresa</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Os dados permanecem separados por tenant; esta tabela apenas consolida a leitura.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Empresa</th>
                    <th className="text-right px-4 py-3">Leads</th>
                    <th className="text-right px-4 py-3">Andamento</th>
                    <th className="text-right px-4 py-3">Fechados</th>
                    <th className="text-right px-4 py-3">Perdidos</th>
                    <th className="text-right px-4 py-3">Compras</th>
                    <th className="text-right px-4 py-3">Clientes</th>
                    <th className="text-right px-4 py-3">Conversão</th>
                    <th className="text-right px-4 py-3">Receita</th>
                    <th className="text-right px-4 py-3">Equipe</th>
                    <th className="text-right px-4 py-3">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {performanceRows.map((tenant) => (
                    <tr key={tenant.tenantId} className="border-t">
                      <td className="px-4 py-3"><div className="font-medium">{tenant.name}</div><div className="text-xs text-muted-foreground">{tenant.slug}</div></td>
                      <td className="px-4 py-3 text-right">{tenant.leads}</td>
                      <td className="px-4 py-3 text-right">{tenant.inProgress}</td>
                      <td className="px-4 py-3 text-right">{tenant.won}</td>
                      <td className="px-4 py-3 text-right">{tenant.lost}</td>
                      <td className="px-4 py-3 text-right">{tenant.purchases}</td>
                      <td className="px-4 py-3 text-right">{tenant.buyingCustomers}</td>
                      <td className="px-4 py-3 text-right">{tenant.conversionRate}%</td>
                      <td className="px-4 py-3 text-right">{formatMoney(tenant.revenueCents)}</td>
                      <td className="px-4 py-3 text-right">{tenant.agents} atend. / {tenant.teamMembers} total</td>
                      <td className="px-4 py-3 text-right">
                        {tenant.accessAllowed ? (
                          <Button className="group-dashboard-print-hide" size="sm" variant="outline" onClick={() => openTenant(tenant.tenantId)} disabled={switchingTenantId === tenant.tenantId}>
                            {switchingTenantId === tenant.tenantId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5 mr-1" />}
                            Abrir
                          </Button>
                        ) : <span className="text-xs text-amber-700">Indisponível</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
