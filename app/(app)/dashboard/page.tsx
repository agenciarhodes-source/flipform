'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, BarChart3, CheckCircle2, ClipboardList, Filter, Flame, LineChart as LineChartIcon, ListChecks, Target, TrendingUp, Trophy, UserPlus, Users } from 'lucide-react';
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
  funnel: null | { pipelineId: string; stages: { id: string; name: string; color: string; count: number; percentage: number; advanceRate: number; dropOffRate: number; isFinal: boolean }[] };
  leadsByDay: { date: string; label: string; real: number; projected: number }[];
  leadProfile: { key: string; label: string; count: number; percentage: number; color: string }[];
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
    <Card className="p-4 border bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className={`rounded-2xl border bg-gradient-to-br p-3 ${tones}`}><Icon className="h-5 w-5" /></div>
      </div>
    </Card>
  );
}

function Skeleton() {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <Card key={i} className="h-28 animate-pulse bg-muted/50" />)}</div>;
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<'today' | '7d' | '30d'>('30d');
  const [pipelineId, setPipelineId] = useState('');
  const [formId, setFormId] = useState('');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ period });
    if (pipelineId) params.set('pipelineId', pipelineId);
    if (formId) params.set('formId', formId);
    fetch(`/api/dashboard?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error || 'Erro ao carregar dashboard');
        return response.json();
      })
      .then(setData)
      .catch((err) => {
        if (err.name !== 'AbortError') setError('Não foi possível carregar o Dashboard. Tente novamente.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [period, pipelineId, formId]);

  const hasData = (data?.summary.totalLeads || 0) > 0;
  const formOptions = useMemo(() => data?.filters.forms.filter((form) => !pipelineId || form.pipelineId === pipelineId) || [], [data, pipelineId]);

  return (
    <div className="space-y-6 p-4 lg:p-8 animate-fade-in">
      <div className="overflow-hidden rounded-3xl border bg-gradient-to-br from-slate-950 via-brand-900 to-blue-700 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/20"><BarChart3 className="h-3.5 w-3.5" /> Dashboard executivo</div>
            <h1 className="font-heading text-3xl font-bold lg:text-4xl">Dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm text-blue-100">Visão geral dos seus leads, formulários e funil comercial com projeções para o período.</p>
          </div>
          <div className="grid gap-2 rounded-2xl bg-white/10 p-3 ring-1 ring-white/20 sm:grid-cols-3">
            <label className="space-y-1 text-xs font-medium text-blue-100"><span>Período</span><select value={period} onChange={(e) => setPeriod(e.target.value as any)} className="w-full rounded-lg border-white/20 bg-white px-3 py-2 text-sm text-slate-900">{periodOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
            <label className="space-y-1 text-xs font-medium text-blue-100"><span>Pipeline</span><select value={pipelineId} onChange={(e) => { setPipelineId(e.target.value); setFormId(''); }} className="w-full rounded-lg border-white/20 bg-white px-3 py-2 text-sm text-slate-900"><option value="">Todos</option>{data?.filters.pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="space-y-1 text-xs font-medium text-blue-100"><span>Formulário</span><select value={formId} onChange={(e) => setFormId(e.target.value)} className="w-full rounded-lg border-white/20 bg-white px-3 py-2 text-sm text-slate-900"><option value="">Todos</option>{formOptions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
          </div>
        </div>
      </div>

      {loading && <Skeleton />}
      {error && <Card className="flex items-center gap-3 border-red-200 bg-red-50 p-5 text-red-700"><AlertCircle className="h-5 w-5" />{error}</Card>}
      {!loading && !error && data && !hasData && <Card className="p-8 text-center"><Filter className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">Ainda não há leads suficientes para gerar métricas.</p><p className="text-sm text-muted-foreground">Crie e divulgue formulários para visualizar o desempenho aqui.</p></Card>}

      {data && !error && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-7">
            <MetricCard title="Total de leads" value={data.summary.totalLeads} icon={Users} hint={data.summary.variationVsPrevious == null ? 'Sem base anterior' : `${data.summary.variationVsPrevious > 0 ? '+' : ''}${data.summary.variationVsPrevious}% vs período anterior`} />
            <MetricCard title="Novos no período" value={data.summary.newLeads} icon={UserPlus} />
            <MetricCard title="Em atendimento" value={data.summary.inProgress} icon={ClipboardList} tone="amber" />
            <MetricCard title="Qualificados" value={data.summary.qualified} icon={Flame} tone="purple" />
            <MetricCard title="Fechamentos" value={data.summary.won} icon={Trophy} tone="green" />
            <MetricCard title="Conversão" value={`${data.summary.conversionRate}%`} icon={TrendingUp} tone="green" />
            <MetricCard title="Taxa de avanço" value={`${data.summary.advancementRate}%`} icon={Target} tone="blue" />
          </div>

          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-heading text-lg font-semibold">Funil visual por etapas</h2><p className="text-sm text-muted-foreground">Etapas reais do pipeline selecionado, ordenadas pelo funil.</p></div></div>
            {!data.funnel ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Selecione um pipeline para visualizar as etapas do funil.</div> : (
              <div className="grid gap-3 lg:grid-cols-4 xl:grid-cols-5">
                {data.funnel.stages.map((stage, index) => <div key={stage.id} className="relative rounded-2xl border bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm">
                  {index < data.funnel!.stages.length - 1 && <ArrowRight className="absolute -right-4 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 text-muted-foreground lg:block" />}
                  <div className="mb-3 h-1.5 rounded-full" style={{ backgroundColor: stage.color }} />
                  <div className="flex items-start justify-between"><h3 className="font-semibold">{stage.name}</h3>{stage.isFinal && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">final</span>}</div>
                  <p className="mt-3 text-3xl font-bold">{stage.count}</p><p className="text-xs text-muted-foreground">{stage.percentage}% do total</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">Avanço {stage.advanceRate}%</span><span className="rounded-lg bg-rose-50 p-2 text-rose-700">Queda {stage.dropOffRate}%</span></div>
                </div>)}
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="p-5 xl:col-span-2"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-heading text-lg font-semibold">Leads gerados no período</h2><p className="text-sm text-muted-foreground">Série real diária e projeção acumulada.</p></div>{data.summary.projectionTotal !== null && <div className="rounded-2xl bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">Projeção: {data.summary.projectionTotal} leads</div>}</div><ResponsiveContainer width="100%" height={320}><LineChart data={data.leadsByDay}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="label" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} allowDecimals={false} /><Tooltip /><Legend /><Line name="Real" type="monotone" dataKey="real" stroke="#2563EB" strokeWidth={3} dot={{ r: 3 }} /><Line name="Projetado" type="monotone" dataKey="projected" stroke="#10B981" strokeWidth={2.5} strokeDasharray="6 6" dot={false} /></LineChart></ResponsiveContainer></Card>
            <Card className="p-5"><h2 className="font-heading text-lg font-semibold">Perfil dos leads</h2><p className="mb-4 text-sm text-muted-foreground">Temperatura e fechamentos.</p><ResponsiveContainer width="100%" height={260}><PieChart><Pie data={data.leadProfile} dataKey="count" nameKey="label" innerRadius={58} outerRadius={92} paddingAngle={3}>{data.leadProfile.map((entry) => <Cell key={entry.key} fill={entry.color} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer><div className="space-y-2">{data.leadProfile.map((item) => <div key={item.key} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span><strong>{item.count} · {item.percentage}%</strong></div>)}</div></Card>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="p-5 xl:col-span-2"><h2 className="font-heading text-lg font-semibold">Performance por formulário</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Formulário</th><th>Leads</th><th>Conversão</th><th>Qualificação</th><th>Último lead</th><th className="text-right">Ações</th></tr></thead><tbody>{data.formsPerformance.map((form) => <tr key={form.id} className="border-t"><td className="py-3 font-medium">{form.name}</td><td>{form.totalLeads}</td><td>{form.conversionRate}%</td><td>{form.qualificationRate}%</td><td>{formatDate(form.lastLeadAt)}</td><td className="space-x-2 text-right"><Button asChild size="sm" variant="outline"><Link href={form.publicUrl}>Abrir</Link></Button><Button asChild size="sm"><Link href={form.editUrl}>Editar</Link></Button></td></tr>)}</tbody></table></div></Card>
            <Card className="p-5"><h2 className="font-heading text-lg font-semibold">Origem dos leads</h2><ResponsiveContainer width="100%" height={220}><BarChart data={data.sources} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis type="number" hide /><YAxis dataKey="source" type="category" width={90} tick={{ fontSize: 12 }} /><Tooltip /><Bar dataKey="count" fill="#6366F1" radius={[0, 8, 8, 0]} /></BarChart></ResponsiveContainer></Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <MetricCard title="Tarefas pendentes" value={data.tasks.pending} icon={ListChecks} />
            <MetricCard title="Tarefas vencidas" value={data.tasks.overdue} icon={AlertCircle} tone="red" />
            <MetricCard title="Concluídas hoje" value={data.tasks.completedToday} icon={CheckCircle2} tone="green" />
            <MetricCard title="Minhas tarefas" value={data.tasks.mine} icon={LineChartIcon} tone="amber" />
          </div>
          {data.tasks.recommendations.length > 0 && <Card className="p-5"><h2 className="font-heading text-lg font-semibold">Próximas ações recomendadas</h2><ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{data.tasks.recommendations.map((item) => <li key={item}>{item}</li>)}</ul></Card>}
        </>
      )}
    </div>
  );
}
