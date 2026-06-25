'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, BarChart3, ClipboardList, Filter, Flame, MapPin, RotateCcw, Target, TrendingUp, Trophy, UserPlus, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type DashboardData = {
  filters: {
    period: 'today' | '7d' | '30d' | 'custom';
    pipelineId: string | null;
    formId: string | null;
    pipelines: { id: string; name: string }[];
    forms: { id: string; name: string; pipelineId: string }[];
    state: string | null;
    city: string | null;
  };
  summary: {
    totalLeads: number;
    newLeads: number;
    inProgress: number;
    qualified: number;
    won: number;
    conversionRate: number;
    advancementRate: number;
    projectionTotal: number | null;
    variationVsPrevious: number | null;
  };
  funnel: null | { pipelineId: string; stages: { id: string; name: string; color: string; count: number; percentage: number; advanceRate: number | null; dropOffRate: number | null; isFinal: boolean }[] };
  leadsByDay: { date: string; label: string; real: number; projected: number }[];
  leadProfile: { key: string; label: string; count: number; percentage: number; color: string }[];
  geo: { selectedState: string | null; selectedCity: string | null; byState: { state: string; label: string; leads: number }[]; byCity: { state: string; city: string; leads: number }[] };
  formsPerformance: { id: string; name: string; slug: string; totalLeads: number; conversionRate: number; qualificationRate: number; lastLeadAt: string | null; publicUrl: string; editUrl: string }[];
  sources: { source: string; count: number; percentage: number }[];
  tasks: { pending: number; overdue: number; completedToday: number; mine: number; recommendations: string[] };
};

const periodOptions = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
] as const;

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function MetricCard({ title, value, hint, icon: Icon, tone = 'blue' }: { title: string; value: string | number; hint?: string; icon: any; tone?: 'blue' | 'green' | 'amber' | 'red' | 'purple' }) {
  const tones = {
    blue: 'from-blue-50 to-sky-50 text-blue-700 border-blue-100',
    green: 'from-emerald-50 to-green-50 text-emerald-700 border-emerald-100',
    amber: 'from-amber-50 to-orange-50 text-amber-700 border-amber-100',
    red: 'from-rose-50 to-red-50 text-rose-700 border-rose-100',
    purple: 'from-violet-50 to-purple-50 text-violet-700 border-violet-100',
  }[tone];
  return (
    <Card className="border bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className={`rounded-xl border bg-gradient-to-br p-2 ${tones}`}><Icon className="h-4 w-4" /></div>
      </div>
    </Card>
  );
}

function Skeleton() {
  return <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <Card key={i} className="h-20 animate-pulse bg-muted/50" />)}</div>;
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<'today' | '7d' | '30d'>('30d');
  const [pipelineId, setPipelineId] = useState('');
  const [formId, setFormId] = useState('');
  const [data, setData] = useState<DashboardData | null>(null);
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ period });
    if (pipelineId) params.set('pipelineId', pipelineId);
    if (formId) params.set('formId', formId);
    if (state) params.set('state', state);
    if (city) params.set('city', city);
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    fetch(`/api/dashboard?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error || 'Erro ao carregar dashboard');
        return response.json();
      })
      .then(setData)
      .catch(() => {
        setError('Não foi possível carregar o dashboard.');
      })
      .finally(() => { window.clearTimeout(timeout); setLoading(false); });
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [period, pipelineId, formId, state, city, retryKey]);

  const hasData = (data?.summary.totalLeads || 0) > 0;
  const formOptions = useMemo(() => data?.filters.forms.filter((form) => !pipelineId || form.pipelineId === pipelineId) || [], [data, pipelineId]);
  const stateOptions = data?.geo.byState || [];
  const cityOptions = data?.geo.byCity.filter((item) => !state || item.state === state) || [];

  return (
    <div className="animate-fade-in space-y-4 p-3 lg:p-5">
      <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-950 via-brand-900 to-blue-700 p-4 text-white shadow-xl">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/20"><BarChart3 className="h-3.5 w-3.5" /> Dashboard executivo</div>
            <h1 className="font-heading text-2xl font-bold lg:text-3xl">Dashboard</h1>
            <p className="mt-1 max-w-2xl text-xs text-blue-100">Visão geral dos seus leads, formulários e funil comercial com projeções para o período.</p>
          </div>
          <div className="grid gap-2 rounded-xl bg-white/10 p-2 ring-1 ring-white/20 sm:grid-cols-5">
            <label className="space-y-1 text-xs font-medium text-blue-100"><span>Período</span><select value={period} onChange={(e) => setPeriod(e.target.value as any)} className="w-full rounded-lg border-white/20 bg-white px-3 py-2 text-sm text-slate-900">{periodOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
            <label className="space-y-1 text-xs font-medium text-blue-100"><span>Pipeline</span><select value={pipelineId} onChange={(e) => { setPipelineId(e.target.value); setFormId(''); }} className="w-full rounded-lg border-white/20 bg-white px-3 py-2 text-sm text-slate-900"><option value="">Todos</option>{data?.filters.pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="space-y-1 text-xs font-medium text-blue-100"><span>Formulário</span><select value={formId} onChange={(e) => setFormId(e.target.value)} className="w-full rounded-lg border-white/20 bg-white px-3 py-2 text-sm text-slate-900"><option value="">Todos</option>{formOptions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
            <label className="space-y-1 text-xs font-medium text-blue-100"><span>Estado</span><select value={state} onChange={(e) => { setState(e.target.value); setCity(''); }} className="w-full rounded-lg border-white/20 bg-white px-2 py-2 text-sm text-slate-900"><option value="">Todos</option>{stateOptions.map((uf) => <option key={uf.state} value={uf.state}>{uf.state} · {uf.label}</option>)}</select></label>
            <label className="space-y-1 text-xs font-medium text-blue-100"><span>Cidade</span><select value={city} onChange={(e) => setCity(e.target.value)} disabled={!state || cityOptions.length === 0} className="w-full rounded-lg border-white/20 bg-white px-2 py-2 text-sm text-slate-900 disabled:opacity-60"><option value="">Todas</option>{cityOptions.map((item) => <option key={`${item.state}-${item.city}`} value={item.city}>{item.city}</option>)}</select></label>
          </div>
        </div>
      </div>

      {loading && <Skeleton />}
      {error && <Card className="flex items-center justify-between gap-3 border-red-200 bg-red-50 p-4 text-red-700"><span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</span><Button size="sm" variant="outline" onClick={() => { setError(''); setRetryKey((key) => key + 1); }}>Tentar novamente</Button></Card>}
      {!loading && !error && data && !hasData && <Card className="p-8 text-center"><Filter className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">Ainda não há leads suficientes para gerar métricas.</p><p className="text-sm text-muted-foreground">Crie e divulgue formulários para visualizar o desempenho aqui.</p></Card>}

      {data && !error && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <MetricCard title="Total de leads" value={data.summary.totalLeads} icon={Users} hint={data.summary.variationVsPrevious == null ? 'Sem base anterior' : `${data.summary.variationVsPrevious > 0 ? '+' : ''}${data.summary.variationVsPrevious}% vs período anterior`} />
            <MetricCard title="Novos no período" value={data.summary.newLeads} icon={UserPlus} />
            <MetricCard title="Em atendimento" value={data.summary.inProgress} icon={ClipboardList} tone="amber" />
            <MetricCard title="Qualificados" value={data.summary.qualified} icon={Flame} tone="purple" />
            <MetricCard title="Fechamentos" value={data.summary.won} icon={Trophy} tone="green" />
            <MetricCard title="Conversão" value={`${data.summary.conversionRate}%`} icon={TrendingUp} tone="green" />
            <MetricCard title="Taxa de avanço" value={`${data.summary.advancementRate}%`} icon={Target} tone="blue" />
          </div>

          <Card className="p-4">
            <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-heading text-lg font-semibold">Funil visual por etapas</h2><p className="text-sm text-muted-foreground">Etapas reais do pipeline selecionado, ordenadas pelo funil.</p></div></div>
            {!data.funnel ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Selecione um pipeline para visualizar as etapas do funil.</div> : (
              <div className="grid gap-3 lg:grid-cols-4 xl:grid-cols-5">
                {data.funnel.stages.map((stage, index) => <div key={stage.id} className="relative rounded-2xl border bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm">
                  {index < data.funnel!.stages.length - 1 && <ArrowRight className="absolute -right-4 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 text-muted-foreground lg:block" />}
                  <div className="mb-3 h-1.5 rounded-full" style={{ backgroundColor: stage.color }} />
                  <div className="flex items-start justify-between"><h3 className="font-semibold">{stage.name}</h3>{stage.isFinal && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">final</span>}</div>
                  <p className="mt-3 text-3xl font-bold">{stage.count}</p><p className="text-xs text-muted-foreground">{stage.percentage}% do total</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">Avanço {stage.advanceRate == null ? '-' : `${stage.advanceRate}%`}</span><span className="rounded-lg bg-rose-50 p-2 text-rose-700">Queda {stage.dropOffRate == null ? '-' : `${stage.dropOffRate}%`}</span></div>
                </div>)}
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="p-5 xl:col-span-2"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-heading text-lg font-semibold">Leads por dia</h2><p className="text-sm text-muted-foreground">Série real diária e projeção acumulada.</p></div>{data.summary.projectionTotal !== null && <div className="rounded-2xl bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">Projeção: {data.summary.projectionTotal} leads</div>}</div><ResponsiveContainer width="100%" height={240}><LineChart data={data.leadsByDay}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="label" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} allowDecimals={false} /><Tooltip /><Legend /><Line name="Real" type="monotone" dataKey="real" stroke="#2563EB" strokeWidth={3} dot={{ r: 3 }} /><Line name="Projetado" type="monotone" dataKey="projected" stroke="#10B981" strokeWidth={2.5} strokeDasharray="6 6" dot={false} /></LineChart></ResponsiveContainer></Card>
            <Card className="p-4"><h2 className="font-heading text-lg font-semibold">Perfil do funil</h2><p className="mb-4 text-sm text-muted-foreground">Temperatura e fechamentos.</p><ResponsiveContainer width="100%" height={210}><PieChart><Pie data={data.leadProfile} dataKey="count" nameKey="label" innerRadius={58} outerRadius={92} paddingAngle={3}>{data.leadProfile.map((entry) => <Cell key={entry.key} fill={entry.color} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer><div className="space-y-2">{data.leadProfile.map((item) => <div key={item.key} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span><strong>{item.count} · {item.percentage}%</strong></div>)}</div></Card>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="p-4 xl:col-span-2"><div className="mb-3 flex items-center justify-between"><div><h2 className="font-heading text-lg font-semibold">Mapa de leads</h2><p className="text-sm text-muted-foreground">Distribuição por estado e ranking por cidade.</p></div><MapPin className="h-5 w-5 text-blue-600" /></div>{data.geo.byState.length === 0 ? <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Ainda não há informações de cidade/estado nos leads.</div> : <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]"><div className="grid grid-cols-4 gap-2 sm:grid-cols-6">{data.geo.byState.slice(0, 27).map((uf) => <button key={uf.state} onClick={() => { setState(uf.state); setCity(''); }} className={`rounded-xl border p-2 text-left transition ${state === uf.state ? 'border-blue-500 bg-blue-50 text-blue-700' : 'bg-slate-50 hover:bg-slate-100'}`}><span className="text-xs font-bold">{uf.state}</span><span className="block truncate text-[10px] text-muted-foreground">{uf.label}</span><strong className="text-sm">{uf.leads}</strong></button>)}</div><div className="space-y-2"><div className="flex items-center justify-between text-sm font-semibold"><span>Cidades</span>{state && <Button size="sm" variant="ghost" onClick={() => { setState(''); setCity(''); }}><RotateCcw className="mr-1 h-3 w-3" />Limpar</Button>}</div>{data.geo.byCity.length === 0 ? <p className="text-sm text-muted-foreground">Selecione um estado ou capture cidades nos formulários.</p> : data.geo.byCity.slice(0, 8).map((item) => <button key={`${item.state}-${item.city}`} onClick={() => { setState(item.state); setCity(item.city); }} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm ${city === item.city ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'bg-white'}`}><span>{item.city} · {item.state}</span><strong>{item.leads}</strong></button>)}</div></div>}</Card>
            <Card className="p-4"><h2 className="font-heading text-lg font-semibold">Tarefas e ações</h2><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl bg-slate-50 p-3"><span className="text-muted-foreground">Pendentes</span><strong className="block text-xl">{data.tasks.pending}</strong></div><div className="rounded-xl bg-rose-50 p-3 text-rose-700"><span>Vencidas</span><strong className="block text-xl">{data.tasks.overdue}</strong></div><div className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><span>Hoje</span><strong className="block text-xl">{data.tasks.completedToday}</strong></div><div className="rounded-xl bg-amber-50 p-3 text-amber-700"><span>Minhas</span><strong className="block text-xl">{data.tasks.mine}</strong></div></div></Card>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="p-5 xl:col-span-2"><h2 className="font-heading text-lg font-semibold">Performance por formulário</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Formulário</th><th>Leads</th><th>Conversão</th><th>Qualificação</th><th>Último lead</th><th className="text-right">Ações</th></tr></thead><tbody>{data.formsPerformance.map((form) => <tr key={form.id} className="border-t"><td className="py-3 font-medium">{form.name}</td><td>{form.totalLeads}</td><td>{form.conversionRate}%</td><td>{form.qualificationRate}%</td><td>{formatDate(form.lastLeadAt)}</td><td className="space-x-2 text-right"><Button asChild size="sm" variant="outline"><Link href={form.publicUrl}>Abrir</Link></Button><Button asChild size="sm"><Link href={form.editUrl}>Editar</Link></Button></td></tr>)}</tbody></table></div></Card>
            <Card className="p-4"><h2 className="font-heading text-lg font-semibold">Origem dos leads</h2><ResponsiveContainer width="100%" height={220}><BarChart data={data.sources} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis type="number" hide /><YAxis dataKey="source" type="category" width={90} tick={{ fontSize: 12 }} /><Tooltip /><Bar dataKey="count" fill="#6366F1" radius={[0, 8, 8, 0]} /></BarChart></ResponsiveContainer></Card>
          </div>

          {data.tasks.recommendations.length > 0 && <Card className="p-4"><h2 className="font-heading text-lg font-semibold">Próximas ações recomendadas</h2><ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{data.tasks.recommendations.map((item) => <li key={item}>{item}</li>)}</ul></Card>}
        </>
      )}
    </div>
  );
}
