'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowDown, ArrowRight, ArrowUp, BarChart3, CheckCircle2, CircleDollarSign, ClipboardList, Clock3, Filter, Flame, LineChart as LineChartIcon, ListChecks, RefreshCw, Target, TrendingUp, Trophy, UserPlus, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type ProfileItem = { key: string; label: string; count: number; percentage: number; color: string };
type ActivityBucket = { label: string; start: string; end: string; count: number; intensity: number };
type DashboardFinancial = { revenue: any; firstPurchaseRevenue: any; recurringRevenue: any; purchases: { current: number; previous: number; delta: number; deltaPercent: number | null }; buyingCustomers: { current: number; previous: number; delta: number; deltaPercent: number | null }; recurringCustomers: { current: number; previous: number; delta: number; deltaPercent: number | null }; repurchaseRate: { current: number; previous: number; deltaPoints: number | null }; averageTicket: { currentCents: number; previousCents: number; deltaPercent: number | null }; averageLtv: { currentCents: number; previousCents: number; deltaPercent: number | null } };
type DashboardData = {
  executive: {
    activityPulse: { buckets: ActivityBucket[]; live: boolean; lastActivityAt?: string };
    revenue: { currentCents: number; previousCents: number | null; current: number; previous: number | null; deltaPercent: number | null; currency: 'BRL'; hasRevenueSource: boolean };
    financial: DashboardFinancial;
    openDeals: { current: number; previous: number | null; delta: number | null; deltaPercent: number | null };
    averageTimeToClose: { currentSeconds: number | null; previousSeconds: number | null; deltaSeconds: number | null };
    conversionRate: { current: number; previous: number | null; deltaPoints: number | null };
  };
  filters: {
    period: 'today' | '7d' | '30d' | 'custom';
    pipelineId: string | null;
    formId: string | null;
    state: string | null;
    city: string | null;
    assignedTo: string | null;
    agents: { userId: string; name: string; email: string }[];
    pipelines: { id: string; name: string }[];
    forms: { id: string; name: string; pipelineId: string }[];
  };
  summary: { totalLeads: number; newLeads: number; inProgress: number; qualified: number; won: number; conversionRate: number; advancementRate: number; projectionTotal: number | null; variationVsPrevious: number | null };
  funnel: null | { pipelineId: string; stages: { id: string; name: string; color: string; count: number; percentage: number; advanceRate: number | null; dropOffRate: number | null; isFinal: boolean }[] };
  leadsByDay: { date: string; label: string; real: number; projected: number }[];
  revenueByDay: { date: string; label: string; amountCents: number }[];
  projection: { total: number | null; averagePerDay: number };
  profile: { temperature: ProfileItem[]; status: ProfileItem[] };
  leadProfile: ProfileItem[];
  geo: { byState: { state: string; label: string; leads: number }[]; byCity: { state: string; city: string; leads: number }[]; selectedState: string | null; selectedCity: string | null };
  formsPerformance: { id: string; name: string; slug: string; totalLeads: number; conversionRate: number; qualificationRate: number; lastLeadAt: string | null; publicUrl: string; editUrl: string }[];
  sources: { source: string; count: number; percentage: number }[];
  teamPerformance: { userId: string; name: string; email: string; leadsReceived: number; inProgress: number; won: number; revenueCents: number; conversionRate: number; averageTicketCents: number; averageCloseTimeHours: number | null }[];
  tasks: { pending: number; overdue: number; completedToday: number; mine: number; recommendations: string[] };
};

const periodOptions = [{ value: 'today', label: 'Hoje' }, { value: '7d', label: '7 dias' }, { value: '30d', label: '30 dias' }, { value: 'custom', label: 'Personalizado' }] as const;
const mapPositions: Record<string, { x: number; y: number }> = { AC: { x: 12, y: 45 }, AM: { x: 24, y: 32 }, RR: { x: 32, y: 16 }, RO: { x: 28, y: 52 }, PA: { x: 47, y: 33 }, AP: { x: 53, y: 18 }, MT: { x: 45, y: 58 }, MS: { x: 50, y: 75 }, GO: { x: 58, y: 62 }, DF: { x: 62, y: 61 }, TO: { x: 60, y: 48 }, MA: { x: 69, y: 40 }, PI: { x: 75, y: 46 }, CE: { x: 82, y: 42 }, RN: { x: 89, y: 44 }, PB: { x: 87, y: 49 }, PE: { x: 84, y: 53 }, AL: { x: 83, y: 58 }, SE: { x: 80, y: 62 }, BA: { x: 72, y: 63 }, MG: { x: 66, y: 76 }, ES: { x: 76, y: 78 }, RJ: { x: 71, y: 84 }, SP: { x: 61, y: 84 }, PR: { x: 58, y: 92 }, SC: { x: 62, y: 97 }, RS: { x: 55, y: 102 } };

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
function rate(value: number | null) { return value == null ? '—' : `${value}%`; }


function moneyFromCents(valueCents: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valueCents / 100); }
function formatDuration(seconds: number | null) {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}min`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
function signed(value: number | null, suffix = '') { return value == null ? 'Sem base anterior' : `${value > 0 ? '+' : ''}${value}${suffix} vs. período anterior`; }

function TeamActivityPulse({ pulse }: { pulse: DashboardData['executive']['activityPulse'] }) {
  return <Card className="overflow-hidden border-slate-200 bg-white/95 p-4 shadow-sm"><div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-heading text-base font-semibold tracking-tight text-slate-950">Pulso do dia — atividade da equipe nas últimas 24h</h2><p className="text-xs text-muted-foreground">Audit logs, movimentações de leads, tarefas, notas e eventos de tracking.</p></div><div className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />Ao vivo</div></div><div className="overflow-x-auto"><div className="flex min-w-[720px] items-end gap-1 rounded-2xl bg-gradient-to-b from-slate-50 to-white px-3 pb-2 pt-4 ring-1 ring-slate-100">{pulse.buckets.map((bucket, index) => <div key={bucket.start} className="group flex min-w-2 flex-1 flex-col items-center gap-1"><div title={`${bucket.count} atividades`} className={`w-full rounded-t-md transition-all ${index > pulse.buckets.length - 5 ? 'bg-emerald-500' : 'bg-blue-500/80'}`} style={{ height: `${Math.max(8, 56 * bucket.intensity)}px`, opacity: bucket.count ? 1 : 0.25 }} /><span className="h-4 text-[10px] text-muted-foreground">{bucket.label}</span></div>)}</div></div>{pulse.lastActivityAt && <p className="mt-2 text-[11px] text-muted-foreground">Última atividade: {formatDate(pulse.lastActivityAt)}</p>}</Card>;
}

function ExecutiveMetricCard({ title, value, hint, positive, icon: Icon }: { title: string; value: string; hint: string; positive?: boolean; icon: any }) {
  const TrendIcon = positive == null ? TrendingUp : positive ? ArrowUp : ArrowDown;
  return <Card className="relative min-h-[112px] overflow-hidden border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{title}</p><p className="mt-2 font-heading text-2xl font-bold tracking-tight text-slate-950">{value}</p><p className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${positive == null ? 'text-muted-foreground' : positive ? 'text-emerald-700' : 'text-rose-700'}`}><TrendIcon className="h-3.5 w-3.5" />{hint}</p></div><div className="rounded-2xl border border-slate-100 bg-slate-50 p-2 text-slate-700"><Icon className="h-4 w-4" /></div></div><div className="absolute bottom-3 right-4 flex h-8 items-end gap-0.5 opacity-40">{[20, 34, 26, 42, 32, 48, 38].map((h, i) => <span key={i} className="w-1 rounded-full bg-slate-400" style={{ height: h / 2 }} />)}</div></Card>;
}

function ExecutiveTop({ data }: { data: DashboardData }) {
  const avgDelta = data.executive.averageTimeToClose.deltaSeconds;
  return <section className="space-y-3"><TeamActivityPulse pulse={data.executive.activityPulse} /><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><ExecutiveMetricCard title="Receita do período" value={moneyFromCents(data.executive.revenue.currentCents)} hint={data.executive.revenue.hasRevenueSource ? signed(data.executive.revenue.deltaPercent, '%') : 'Sem fonte de receita configurada'} positive={(data.executive.revenue.deltaPercent ?? 0) >= 0} icon={CircleDollarSign} /><ExecutiveMetricCard title="Negócios abertos" value={`${data.executive.openDeals.current} deals`} hint={signed(data.executive.openDeals.delta)} positive={(data.executive.openDeals.delta ?? 0) >= 0} icon={ClipboardList} /><ExecutiveMetricCard title="Tempo médio até fechamento" value={formatDuration(data.executive.averageTimeToClose.currentSeconds)} hint={avgDelta == null ? 'Sem base anterior' : `${avgDelta < 0 ? '↓ ' : '↑ '}${formatDuration(Math.abs(avgDelta))} vs. período anterior`} positive={avgDelta == null ? undefined : avgDelta <= 0} icon={Clock3} /><ExecutiveMetricCard title="Taxa de conversão" value={`${data.executive.conversionRate.current}%`} hint={signed(data.executive.conversionRate.deltaPoints, 'pp')} positive={(data.executive.conversionRate.deltaPoints ?? 0) >= 0} icon={TrendingUp} /></div></section>;
}

function FinancialPanel({ data }: { data: DashboardData }) {
  const financial = data.executive.financial;
  return <Card className="p-4"><div className="mb-3"><h2 className="font-heading text-base font-semibold">Financeiro do período</h2><p className="text-xs text-muted-foreground">Receita baseada em compras registradas, com fallback seguro para valor vendido legado.</p></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><MetricCard title="Compras" value={financial.purchases.current} hint={signed(financial.purchases.delta)} icon={CircleDollarSign} tone="green" /><MetricCard title="Ticket médio" value={moneyFromCents(financial.averageTicket.currentCents)} hint={signed(financial.averageTicket.deltaPercent, '%')} icon={TrendingUp} /><MetricCard title="Receita recorrente" value={moneyFromCents(financial.recurringRevenue.currentCents)} hint={signed(financial.recurringRevenue.deltaPercent, '%')} icon={RefreshCw} tone="purple" /><MetricCard title="Taxa de recompra" value={`${financial.repurchaseRate.current}%`} hint={signed(financial.repurchaseRate.deltaPoints, 'pp')} icon={Users} tone="amber" /></div><div className="mt-4"><h3 className="text-sm font-semibold">Receita por dia</h3><ResponsiveContainer width="100%" height={220}><BarChart data={data.revenueByDay}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => moneyFromCents(Number(value))} /><Tooltip formatter={(value) => moneyFromCents(Number(value))} /><Bar dataKey="amountCents" name="Receita" fill="#10B981" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>;
}

function MetricCard({ title, value, hint, icon: Icon, tone = 'blue' }: { title: string; value: string | number; hint?: string; icon: any; tone?: 'blue' | 'green' | 'amber' | 'red' | 'purple' }) {
  const tones = { blue: 'from-blue-50 to-sky-50 text-blue-700 border-blue-100', green: 'from-emerald-50 to-green-50 text-emerald-700 border-emerald-100', amber: 'from-amber-50 to-orange-50 text-amber-700 border-amber-100', red: 'from-rose-50 to-red-50 text-rose-700 border-rose-100', purple: 'from-violet-50 to-purple-50 text-violet-700 border-violet-100' }[tone];
  return <Card className="min-h-[94px] border bg-white p-3 shadow-sm"><div className="flex items-start justify-between gap-2"><div><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>{hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}</div><div className={`rounded-xl border bg-gradient-to-br p-2 ${tones}`}><Icon className="h-4 w-4" /></div></div></Card>;
}
function Skeleton() { return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">{Array.from({ length: 7 }).map((_, i) => <Card key={i} className="h-24 animate-pulse bg-muted/50" />)}</div>; }

function GeoPanel({ data, state, setState, city, setCity }: { data: DashboardData; state: string; setState: (v: string) => void; city: string; setCity: (v: string) => void }) {
  const max = Math.max(1, ...data.geo.byState.map((row) => row.leads));
  const cities = data.geo.byCity;
  return <Card className="p-4"><div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-heading text-base font-semibold">Mapa de leads</h2><p className="text-xs text-muted-foreground">Distribuição por UF e cidade.</p></div><div className="flex gap-2"><select value={state} onChange={(e) => { setState(e.target.value); setCity(''); }} className="rounded-lg border bg-white px-2 py-1.5 text-xs"><option value="">Estado</option>{data.geo.byState.map((row) => <option key={row.state} value={row.state}>{row.state}</option>)}</select><select value={city} onChange={(e) => setCity(e.target.value)} disabled={!state} className="rounded-lg border bg-white px-2 py-1.5 text-xs disabled:opacity-50"><option value="">Cidade</option>{cities.map((row) => <option key={`${row.state}-${row.city}`} value={row.city}>{row.city}</option>)}</select></div></div>{data.geo.byState.length === 0 ? <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Ainda não há informações de cidade/estado nos leads.</div> : <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]"><svg viewBox="0 0 100 110" className="h-64 w-full rounded-2xl bg-gradient-to-br from-blue-50 to-emerald-50"><path d="M23 18 L54 13 L83 38 L88 58 L73 83 L63 104 L43 93 L30 68 L8 56 Z" fill="#dbeafe" stroke="#93c5fd" strokeWidth="1.4" />{data.geo.byState.map((row) => { const pos = mapPositions[row.state]; if (!pos) return null; const selected = row.state === state; return <g key={row.state} role="button" onClick={() => { setState(row.state); setCity(''); }} className="cursor-pointer"><circle cx={pos.x} cy={pos.y} r={5 + (row.leads / max) * 8} fill={selected ? '#10B981' : '#2563EB'} opacity="0.82" /><text x={pos.x} y={pos.y + 1.5} textAnchor="middle" fontSize="4" fill="white" fontWeight="700">{row.state}</text></g>; })}</svg><div className="space-y-2"><p className="text-xs font-semibold uppercase text-muted-foreground">Ranking por cidade</p>{cities.length === 0 ? data.geo.byState.slice(0, 8).map((row) => <div key={row.state} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"><span>{row.label}</span><strong>{row.leads}</strong></div>) : cities.map((row) => <div key={`${row.state}-${row.city}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"><span>{row.city} · {row.state}</span><strong>{row.leads}</strong></div>)}</div></div>}</Card>;
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<'today' | '7d' | '30d' | 'custom'>('30d');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [formId, setFormId] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    setLoading(true); setError('');
    const params = new URLSearchParams({ period });
    if (period === 'custom') { if (startDate) params.set('startDate', startDate); if (endDate) params.set('endDate', endDate); }
    if (pipelineId) params.set('pipelineId', pipelineId);
    if (formId) params.set('formId', formId);
    if (state) params.set('state', state);
    if (city) params.set('city', city);
    if (assignedTo) params.set('assignedTo', assignedTo);
    window.history.replaceState(null, '', `/dashboard?${params.toString()}`);
    fetch(`/api/dashboard?${params.toString()}`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error((await response.json()).error || 'Erro ao carregar dashboard');
      return response.json();
    }).then(setData).catch((err) => { if (err.name !== 'AbortError') setError('Não foi possível carregar o dashboard.'); else setError('Não foi possível carregar o dashboard.'); }).finally(() => { clearTimeout(timeout); setLoading(false); });
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [period, startDate, endDate, pipelineId, formId, state, city, assignedTo, retry]);

  const hasData = (data?.summary.totalLeads || 0) > 0;
  const formOptions = useMemo(() => data?.filters.forms.filter((form) => !pipelineId || form.pipelineId === pipelineId) || [], [data, pipelineId]);

  return <div className="space-y-4 p-3 lg:p-5 animate-fade-in">
    <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-950 via-brand-900 to-blue-700 p-4 text-white shadow-lg"><div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between"><div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium ring-1 ring-white/20"><BarChart3 className="h-3 w-3" /> Dashboard executivo</div><h1 className="font-heading text-2xl font-bold">Dashboard</h1><p className="mt-1 text-xs text-blue-100">Leads, funil e desempenho comercial.</p></div><div className="grid gap-2 rounded-xl bg-white/10 p-2 ring-1 ring-white/20 sm:grid-cols-5 xl:grid-cols-8"><label className="space-y-1 text-[11px] font-medium text-blue-100"><span>Período</span><select value={period} onChange={(e) => setPeriod(e.target.value as any)} className="w-full rounded-lg bg-white px-2 py-1.5 text-xs text-slate-900">{periodOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>{period === 'custom' && <><label className="space-y-1 text-[11px] font-medium text-blue-100"><span>Data inicial</span><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg bg-white px-2 py-1.5 text-xs text-slate-900" /></label><label className="space-y-1 text-[11px] font-medium text-blue-100"><span>Data final</span><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-lg bg-white px-2 py-1.5 text-xs text-slate-900" /></label></>}<label className="space-y-1 text-[11px] font-medium text-blue-100"><span>Pipeline</span><select value={pipelineId} onChange={(e) => { setPipelineId(e.target.value); setFormId(''); }} className="w-full rounded-lg bg-white px-2 py-1.5 text-xs text-slate-900"><option value="">Todos</option>{data?.filters.pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="space-y-1 text-[11px] font-medium text-blue-100"><span>Formulário</span><select value={formId} onChange={(e) => setFormId(e.target.value)} className="w-full rounded-lg bg-white px-2 py-1.5 text-xs text-slate-900"><option value="">Todos</option>{formOptions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label><label className="space-y-1 text-[11px] font-medium text-blue-100"><span>Estado</span><select value={state} onChange={(e) => { setState(e.target.value); setCity(''); }} className="w-full rounded-lg bg-white px-2 py-1.5 text-xs text-slate-900"><option value="">Todos</option>{data?.geo.byState.map((s) => <option key={s.state} value={s.state}>{s.state}</option>)}</select></label><label className="space-y-1 text-[11px] font-medium text-blue-100"><span>Cidade</span><select value={city} onChange={(e) => setCity(e.target.value)} disabled={!state} className="w-full rounded-lg bg-white px-2 py-1.5 text-xs text-slate-900 disabled:opacity-60"><option value="">Todas</option>{data?.geo.byCity.map((c) => <option key={`${c.state}-${c.city}`} value={c.city}>{c.city}</option>)}</select></label>{data?.filters.agents?.length ? <label className="space-y-1 text-[11px] font-medium text-blue-100"><span>Vendedor</span><select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="w-full rounded-lg bg-white px-2 py-1.5 text-xs text-slate-900"><option value="">Todos</option>{data.filters.agents.map((a) => <option key={a.userId} value={a.userId}>{a.name}</option>)}</select></label> : null}</div></div></div>

    {loading && <Skeleton />}
    {error && <Card className="flex items-center justify-between gap-3 border-red-200 bg-red-50 p-4 text-red-700"><span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</span><Button size="sm" variant="outline" onClick={() => setRetry((value) => value + 1)}><RefreshCw className="mr-2 h-3.5 w-3.5" />Tentar novamente</Button></Card>}
    {!loading && !error && data && !hasData && <Card className="p-6 text-center"><Filter className="mx-auto mb-2 h-7 w-7 text-muted-foreground" /><p className="font-medium">Ainda não há leads suficientes para gerar métricas.</p><p className="text-sm text-muted-foreground">Crie e divulgue formulários para visualizar o desempenho aqui.</p></Card>}

    {data && !error && <>
      <ExecutiveTop data={data} />

      <FinancialPanel data={data} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7"><MetricCard title="Total de leads" value={data.summary.totalLeads} icon={Users} hint={data.summary.variationVsPrevious == null ? 'Sem base anterior' : `${data.summary.variationVsPrevious > 0 ? '+' : ''}${data.summary.variationVsPrevious}% vs anterior`} /><MetricCard title="Novos no período" value={data.summary.newLeads} icon={UserPlus} /><MetricCard title="Em atendimento" value={data.summary.inProgress} icon={ClipboardList} tone="amber" /><MetricCard title="Qualificados" value={data.summary.qualified} icon={Flame} tone="purple" /><MetricCard title="Fechamentos" value={data.summary.won} icon={Trophy} tone="green" /><MetricCard title="Conversão" value={`${data.summary.conversionRate}%`} icon={TrendingUp} tone="green" /><MetricCard title="Taxa de avanço" value={`${data.summary.advancementRate}%`} icon={Target} /></div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2"><Card className="p-4"><div className="mb-3"><h2 className="font-heading text-base font-semibold">Funil visual por etapas</h2><p className="text-xs text-muted-foreground">Etapas reais do pipeline selecionado.</p></div>{!data.funnel ? <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Selecione um pipeline para visualizar as etapas do funil.</div> : <div className="space-y-2">{data.funnel.stages.map((stage, index) => <div key={stage.id} className="relative rounded-xl border bg-gradient-to-r from-white to-slate-50 p-3"><div className="mb-2 flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />{stage.name}</span>{stage.isFinal && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">final</span>}</div><div className="grid grid-cols-4 items-end gap-2 text-xs"><strong className="text-2xl">{stage.count}</strong><span>{stage.percentage}% total</span><span className="text-emerald-700">Avanço {rate(stage.advanceRate)}</span><span className="text-rose-700">Queda {rate(stage.dropOffRate)}</span></div><div className="mt-2 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, stage.percentage)}%`, backgroundColor: stage.color }} /></div>{index < data.funnel!.stages.length - 1 && <ArrowRight className="absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground xl:block" />}</div>)}</div>}</Card><Card className="p-4"><div className="mb-2 flex items-center justify-between"><div><h2 className="font-heading text-base font-semibold">Leads por dia</h2><p className="text-xs text-muted-foreground">Real diário e linha projetada.</p></div>{data.projection.total !== null && <div className="rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">Projeção: {data.projection.total}</div>}</div><ResponsiveContainer width="100%" height={265}><LineChart data={data.leadsByDay}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} /><Tooltip /><Legend /><Line name="Real" type="monotone" dataKey="real" stroke="#2563EB" strokeWidth={3} dot={{ r: 2 }} /><Line name="Projetado" type="monotone" dataKey="projected" stroke="#10B981" strokeWidth={2} strokeDasharray="6 6" dot={false} /></LineChart></ResponsiveContainer></Card></div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2"><GeoPanel data={data} state={state} setState={setState} city={city} setCity={setCity} /><Card className="p-4"><h2 className="font-heading text-base font-semibold">Perfil do funil</h2><p className="mb-2 text-xs text-muted-foreground">Temperatura e estágio/status.</p><div className="grid gap-2 md:grid-cols-2"><ResponsiveContainer width="100%" height={210}><PieChart><Pie data={data.profile.temperature} dataKey="count" nameKey="label" innerRadius={48} outerRadius={76} paddingAngle={3}>{data.profile.temperature.map((entry) => <Cell key={entry.key} fill={entry.color} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer><ResponsiveContainer width="100%" height={210}><PieChart><Pie data={data.profile.status} dataKey="count" nameKey="label" innerRadius={48} outerRadius={76} paddingAngle={3}>{data.profile.status.map((entry) => <Cell key={entry.key} fill={entry.color} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div></Card></div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3"><Card className="p-4 xl:col-span-2"><h2 className="font-heading text-base font-semibold">Performance por formulário</h2><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Formulário</th><th>Leads</th><th>Conversão</th><th>Qualificação</th><th>Último lead</th><th className="text-right">Ações</th></tr></thead><tbody>{data.formsPerformance.map((form) => <tr key={form.id} className="border-t"><td className="py-2.5 font-medium">{form.name}</td><td>{form.totalLeads}</td><td>{form.conversionRate}%</td><td>{form.qualificationRate}%</td><td>{formatDate(form.lastLeadAt)}</td><td className="space-x-2 text-right"><Button asChild size="sm" variant="outline"><Link href={form.publicUrl}>Abrir</Link></Button><Button asChild size="sm"><Link href={form.editUrl}>Editar</Link></Button></td></tr>)}</tbody></table></div></Card><Card className="p-4"><h2 className="font-heading text-base font-semibold">Origem dos leads</h2><ResponsiveContainer width="100%" height={220}><BarChart data={data.sources} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis type="number" hide /><YAxis dataKey="source" type="category" width={90} tick={{ fontSize: 12 }} /><Tooltip /><Bar dataKey="count" fill="#6366F1" radius={[0, 8, 8, 0]} /></BarChart></ResponsiveContainer></Card></div>


      {data.teamPerformance.length > 0 && <Card className="p-4"><h2 className="font-heading text-base font-semibold">Performance por vendedor</h2><p className="mb-3 text-xs text-muted-foreground">Leads recebidos, atendimento, fechamentos, receita e ticket médio por Atendente/Vendedor.</p><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Vendedor</th><th>Leads recebidos</th><th>Em atendimento</th><th>Fechamentos</th><th>Receita</th><th>Conversão</th><th>Ticket médio</th></tr></thead><tbody>{data.teamPerformance.map((seller) => <tr key={seller.userId} className="border-t"><td className="py-2.5 font-medium">{seller.name}</td><td>{seller.leadsReceived}</td><td>{seller.inProgress}</td><td>{seller.won}</td><td>{moneyFromCents(seller.revenueCents)}</td><td>{seller.conversionRate}%</td><td>{moneyFromCents(seller.averageTicketCents)}</td></tr>)}</tbody></table></div></Card>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><MetricCard title="Tarefas pendentes" value={data.tasks.pending} icon={ListChecks} /><MetricCard title="Tarefas vencidas" value={data.tasks.overdue} icon={AlertCircle} tone="red" /><MetricCard title="Concluídas hoje" value={data.tasks.completedToday} icon={CheckCircle2} tone="green" /><MetricCard title="Minhas tarefas" value={data.tasks.mine} icon={LineChartIcon} tone="amber" /></div>{data.tasks.recommendations.length > 0 && <Card className="p-4"><h2 className="font-heading text-base font-semibold">Próximas ações recomendadas</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{data.tasks.recommendations.map((item) => <li key={item}>{item}</li>)}</ul></Card>}
    </>}
  </div>;
}
