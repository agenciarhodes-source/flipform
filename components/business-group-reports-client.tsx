'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, CircleDollarSign, Loader2, Printer, RefreshCcw, Target, TrendingUp, Trophy, Users, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function formatMoney(cents: number) {
  return money.format((cents || 0) / 100);
}

type Overview = {
  period: 'today' | '7d' | '30d';
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
    revenueCents: number;
    companies: number;
    teamMembers: number;
    agents: number;
  };
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
    revenueCents: number;
    teamMembers: number;
    agents: number;
  }>;
};

const PERIOD_LABELS: Record<string, string> = {
  today: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
};

export function BusinessGroupReportsClient() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [period, setPeriod] = useState<'today' | '7d' | '30d'>('30d');
  const [groupId, setGroupId] = useState('');
  const [tenantId, setTenantId] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period });
      if (groupId) params.set('groupId', groupId);
      if (tenantId !== 'all') params.set('tenantId', tenantId);
      const response = await fetch(`/api/business-groups/overview?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Erro ao gerar relatório do grupo.');
      setOverview(payload);
      setGeneratedAt(new Date());
      if (!groupId) setGroupId(payload.group.id);
    } catch (e: any) {
      setError(e.message || 'Erro ao gerar relatório do grupo.');
    } finally {
      setLoading(false);
    }
  }, [period, groupId, tenantId]);

  useEffect(() => { load(); }, [load]);

  const performanceRows = useMemo(() => {
    if (!overview) return [];
    if (!overview.selectedTenantId) return overview.tenantPerformance;
    return overview.tenantPerformance.filter((row) => row.tenantId === overview.selectedTenantId);
  }, [overview]);

  const cards = overview ? [
    { label: 'Leads', value: overview.summary.totalLeads, icon: Users },
    { label: 'Em andamento', value: overview.summary.inProgress, icon: TrendingUp },
    { label: 'Ganhos', value: overview.summary.won, icon: Trophy },
    { label: 'Perdidos', value: overview.summary.lost, icon: XCircle },
    { label: 'Conversão', value: `${overview.summary.conversionRate}%`, icon: Target },
    { label: 'Receita', value: formatMoney(overview.summary.revenueCents), icon: CircleDollarSign },
  ] : [];

  return (
    <div className="group-report-page p-4 lg:p-8 space-y-5">
      <style jsx global>{`
        @media print {
          body:has(.group-report-page) aside,
          body:has(.group-report-page) header,
          body:has(.group-report-page) .group-report-print-hide { display: none !important; }
          body:has(.group-report-page) main { overflow: visible !important; }
          body:has(.group-report-page) .group-report-page { padding: 0 !important; }
          body:has(.group-report-page) .group-report-print-card { box-shadow: none !important; break-inside: avoid; }
        }
      `}</style>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between group-report-print-hide">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-brand-600" />
            <h1 className="font-heading text-2xl lg:text-3xl font-bold">Relatórios do grupo</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Gere uma visão consolidada ou filtre uma empresa específica para imprimir ou salvar em PDF.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {overview && overview.groupOptions.length > 1 && (
            <Select value={groupId || overview.group.id} onValueChange={(value) => { setGroupId(value); setTenantId('all'); }}>
              <SelectTrigger className="w-[210px]"><SelectValue placeholder="Grupo" /></SelectTrigger>
              <SelectContent>{overview.groupOptions.map((group) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Select value={tenantId} onValueChange={setTenantId}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda a operação</SelectItem>
              {overview?.tenantOptions.map((tenant) => (
                <SelectItem key={tenant.id} value={tenant.id} disabled={!tenant.accessAllowed}>
                  {tenant.name}{tenant.accessAllowed ? '' : ' — indisponível'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={(value) => setPeriod(value as typeof period)}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="7d">7 dias</SelectItem>
              <SelectItem value="30d">30 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Gerar relatório
          </Button>
          <Button onClick={() => window.print()} disabled={!overview || loading}>
            <Printer className="w-4 h-4 mr-2" /> Imprimir / Salvar PDF
          </Button>
        </div>
      </div>

      {error && <Card className="p-4 border-rose-200 bg-rose-50 text-rose-800 text-sm group-report-print-hide">{error}</Card>}

      {loading && !overview ? (
        <div className="py-16 flex justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" />Gerando relatório...</div>
      ) : overview ? (
        <>
          <Card className="p-5 group-report-print-card">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Relatório operacional</div>
                <h2 className="font-heading text-xl font-bold mt-1">{overview.group.name}</h2>
                <div className="text-sm mt-1">{overview.scopeLabel}</div>
              </div>
              <div className="text-xs text-muted-foreground sm:text-right">
                <div>Período: {PERIOD_LABELS[overview.period]}</div>
                <div>Gerado em: {generatedAt?.toLocaleString('pt-BR') || '—'}</div>
                <div>{overview.summary.companies} empresa(s) · {overview.summary.agents} atendente(s)</div>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.label} className="p-4 group-report-print-card">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs text-muted-foreground">{card.label}</div>
                      <div className="font-heading text-xl font-bold mt-1">{card.value}</div>
                    </div>
                    <Icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                </Card>
              );
            })}
          </div>

          <Card className="overflow-hidden group-report-print-card">
            <div className="px-4 py-3 border-b">
              <h3 className="font-heading font-semibold">Resultado por empresa</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Os dados permanecem isolados por tenant; o relatório apenas consolida a leitura.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Empresa</th>
                    <th className="text-right px-4 py-3">Leads</th>
                    <th className="text-right px-4 py-3">Andamento</th>
                    <th className="text-right px-4 py-3">Ganhos</th>
                    <th className="text-right px-4 py-3">Perdidos</th>
                    <th className="text-right px-4 py-3">Conversão</th>
                    <th className="text-right px-4 py-3">Receita</th>
                    <th className="text-right px-4 py-3">Equipe</th>
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
                      <td className="px-4 py-3 text-right">{tenant.conversionRate}%</td>
                      <td className="px-4 py-3 text-right">{formatMoney(tenant.revenueCents)}</td>
                      <td className="px-4 py-3 text-right">{tenant.agents} atend. / {tenant.teamMembers} total</td>
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
